// Imports
const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const {searchType, searchEnvironment}  = require ('./helper/enum.js')
const readFileAsync = promisify(fs.readFile);
const { listLambdas, modifyLambdaConcurrency } = require('./helper/aws/lambda')
const {  modifyEventBridgeRules } = require('./helper/aws/eventbridge')
const {  modifyVpnConnectionRoute } = require('./helper/aws/ec2')
const {  updateDistribution, createInvalidation } = require('./helper/aws/cloudfront')


const processLambda = async (environmentConfig, switchingTo) => {
    console.log("Processing lambda")
    const region = switchingTo == environmentConfig.switching_to? environmentConfig.active_region : environmentConfig.failover_region;
    const lambdaProperties = switchingTo === environmentConfig.switching_to ? environmentConfig.active_lambdas : environmentConfig.failover_lambdas;
    const eventbridge = new AWS.EventBridge({ region });
    const lambda = new AWS.Lambda({ region });
    try 
    {
        if (searchType.ARN == lambdaProperties.type) {
            console.log("Lambda arn was provided");
            await modifyLambdaConcurrency(lambda, lambdaProperties.items,  lambdaProperties.concurrency)
            await modifyEventBridgeRules(eventbridge, lambdaProperties.items, lambdaProperties.enable)
        }
        else if (searchType.PREFIX == lambdaProperties.type) {
            console.log("Lambda prefix was provided");
            let aggregateLambdaArns = []
            for(let item of lambdaProperties.items ){
                let lambdaArns = await listLambdas(lambda, item)
                aggregateLambdaArns = aggregateLambdaArns.concat(lambdaArns)
            }
            await modifyLambdaConcurrency(lambda, aggregateLambdaArns,  lambdaProperties.concurrency)
            await modifyEventBridgeRules(eventbridge, aggregateLambdaArns, lambdaProperties.enable)
        }
        else {
            console.log("No Lambda arn and no Lambda prefix was provided");
            let lambdaArns = await listLambdas(lambda)
            await modifyLambdaConcurrency(lambda, lambdaArns,  lambdaProperties.concurrency)
            await modifyEventBridgeRules(eventbridge, lambdaArns, lambdaProperties.enable)
        }   
    }
    catch (error) {
        console.error('Error:', error);
    }
};

const processVpnEndpoint = async (environmentConfig, currentEnvironment) => {
    console.log("Processing VPN ENDPOINT")
    try {
        const ec2 = new AWS.EC2({ region: currentEnvironment === searchEnvironment.ACTIVE_ENV ? environmentConfig.active_region : environmentConfig.failover_region });
        let ips = environmentConfig.vpn_endpoints.ips
        let endPointsToAddIpsFrom = currentEnvironment === searchEnvironment.ACTIVE_ENV ? environmentConfig.vpn_endpoints.active_vpn_endpoints_id : environmentConfig.vpn_endpoints.failover_vpn_endpoints_id;
        let endPointsToRemoveIpsFrom = currentEnvironment !== searchEnvironment.ACTIVE_ENV ? environmentConfig.vpn_endpoints.active_vpn_endpoints_id : environmentConfig.vpn_endpoints.failover_vpn_endpoints_id;
    
        console.log(`Adding ips to ${currentEnvironment === searchEnvironment.ACTIVE_ENV ? searchEnvironment.ACTIVE_ENV : searchEnvironment.FAILOVER_ENV  } vpc endpoint`)
        await modifyVpnConnectionRoute(ec2, endPointsToAddIpsFrom, ips, true)
    
    
        console.log(`Removing ips from ${currentEnvironment !== searchEnvironment.ACTIVE_ENV ? searchEnvironment.ACTIVE_ENV : searchEnvironment.FAILOVER_ENV  } vpc endpoint`)
        await modifyVpnConnectionRoute(ec2, endPointsToRemoveIpsFrom, ips, false)
    }
    catch (error) {
        console.error('Error:', error);
    }
}

const processCloudFront = async (cloudfrontSettings) => {
    console.log("Updating Cloudfront")
    const cloudfront = new AWS.CloudFront();
    try 
    {
        for (const distribution of cloudfrontSettings.cloudfront) {
            const data = await cloudfront.getDistributionConfig({ Id: distribution.id }).promise();
            const distributionConfig = data.DistributionConfig;

            const cloudfrontConfig = cloudfrontSettings.cloudfront.find(c => c.id === distribution.id);
            if (!cloudfrontConfig) {
                throw new Error(`CloudFront distribution with ID '${distribution.id}' not found in the JSON.`);
            }

            const defaultBehavior = distributionConfig.DefaultCacheBehavior;
            if (cloudfrontSettings.switching_to === searchEnvironment.ACTIVE_ENV) {
                defaultBehavior.TargetOriginId = cloudfrontConfig.behaviors[0].active_origin;
            } else {
                defaultBehavior.TargetOriginId = cloudfrontConfig.behaviors[0].failover_origin;
            }
            const cacheBehaviors = distributionConfig.CacheBehaviors.Items;
            for (const behavior of cloudfrontConfig.behaviors) {
                const activeOrigin = behavior.active_origin;
                const failoverOrigin = behavior.failover_origin;

                for (const cacheBehavior of cacheBehaviors) {
                    if (cloudfrontSettings.switching_to === searchEnvironment.ACTIVE_ENV && cacheBehavior.TargetOriginId === failoverOrigin) {
                        cacheBehavior.TargetOriginId = activeOrigin;
                    } else if (cloudfrontSettings.switching_to === searchEnvironment.FAILOVER_ENV && cacheBehavior.TargetOriginId === activeOrigin) {
                        cacheBehavior.TargetOriginId = failoverOrigin;
                    }
                }
            }
            await updateDistribution(cloudfront, distribution.id, distributionConfig, data.ETag)
            await createInvalidation(cloudfront, distribution.id)
        }

    } catch (error) {
        console.error('Error updating CloudFront behaviors:', error);
    }
}   

const mainFunction = async () => {
    program
    .version('0.0.1')
    .option('-a --processAll', "Process all services")
    .option('-c --processCloudFront', "Process Cloudfront")
    .option('-l --processLambda', "Process Lambda")
    .option('-v --processVpnEndpoint', "Process VpnEndpoint")
    .option('-f, --file <file>', "File to read")
    .parse(process.argv);
    
    const options = program.opts();
    if (!options.file)
    {
        console.error("Configuration file is missing")
        return;
    }

    const file = options.file;
    let envs = await readAndParseFile(file)

    const currentEnvironment = envs.switching_to;
    if (options.processAll || options.processCloudFront)
        await processCloudFront(envs);
    if (options.processAll || options.processLambda) {
        await processLambda(envs, searchEnvironment.ACTIVE_ENV);
        await processLambda(envs, searchEnvironment.FAILOVER_ENV);
    }
    if (options.processAll || options.processVpnEndpoint)
        await processVpnEndpoint(envs, currentEnvironment)
};

async function readAndParseFile(file) {
    const data = await readFileAsync(file, { encoding: 'utf-8' });
    const dataToJson = JSON.parse(data);
    return dataToJson
  }


mainFunction()
    .then(() => {
        console.log("Process completed");
    })
    .catch((error) => {
        console.error('Error:', error);
    });
