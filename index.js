// Imports
const AWS = require('aws-sdk');
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const {lambdaType, lambdaEnvironment}  = require ('./enum.js')
const readFileAsync = promisify(fs.readFile);
const { listLambdas, modifyLambdaConcurrency } = require('../helper/lambda')
const {  modifyEventBridgeRules } = require('../helper/eventbridge')
const {  modifyVpnConnectionRoute } = require('../helper/ec2')


const processLambda = async (environmentConfig, enable, concurrency) => {
    console.log("Processing lambda")

    let region =   enable ? environmentConfig.active_region : environmentConfig.failover_region
    let lambdaProperties = enable ? environmentConfig.active_lambdas : environmentConfig.failover_lambdas
    const eventbridge = new AWS.EventBridge({ region})
    const lambda = new AWS.Lambda ({ region})
    try 
    {
        if (lambdaType.ARN == lambdaProperties.type) {
            console.log("Lambda arn was provided");
            await modifyLambdaConcurrency(lambda, lambdaProperties.items,  concurrency)
            await modifyEventBridgeRules(eventbridge, lambdaProperties.items, enable)
        }
        else if (lambdaType.PREFIX == lambdaProperties.type) {
            console.log("Lambda prefix was provided");
            let aggregateLambdaArns = []
            for(let item of lambdaProperties.items ){
                let lambdaArns = await listLambdas(lambda, item)
                aggregateLambdaArns = aggregateLambdaArns.concat(lambdaArns)
            }
            await modifyLambdaConcurrency(lambda, aggregateLambdaArns,  concurrency)
            await modifyEventBridgeRules(eventbridge, aggregateLambdaArns, enable)
        }
        else {
            console.log("No Lambda arn and no Lambda prefix was provided");
            let lambdaArns = await listLambdas(lambda)
            await modifyLambdaConcurrency(lambda, lambdaArns,  concurrency)
            await modifyEventBridgeRules(eventbridge, lambdaArns, enable)
        }   
    }
    catch (error) {
        console.error('Error:', error);
    }
};

const processVpnEndpoint = async (environmentConfig, currentEnvironment) => {
    console.log("Processing VPN ENDPOINT")
    try {
        const ec2 = new AWS.EC2({ region: currentEnvironment === lambdaEnvironment.ACTIVE_ENV ? environmentConfig.active_region : environmentConfig.failover_region });
        let ips = environmentConfig.vpn_endpoints.ips
        let endPointsToAddIpsFrom = currentEnvironment === lambdaEnvironment.ACTIVE_ENV ? environmentConfig.vpn_endpoints.active_vpn_endpoints_id : environmentConfig.vpn_endpoints.failover_vpn_endpoints_id;
        let endPointsToRemoveIpsFrom = currentEnvironment !== lambdaEnvironment.ACTIVE_ENV ? environmentConfig.vpn_endpoints.active_vpn_endpoints_id : environmentConfig.vpn_endpoints.failover_vpn_endpoints_id;
    
        console.log(`Adding ips to ${currentEnvironment === lambdaEnvironment.ACTIVE_ENV ? lambdaEnvironment.ACTIVE_ENV : lambdaEnvironment.FAILOVER_ENV  } vpc endpoint`)
        await modifyVpnConnectionRoute(ec2, endPointsToAddIpsFrom, ips, true)
    
    
        console.log(`Removing ips from ${currentEnvironment !== lambdaEnvironment.ACTIVE_ENV ? lambdaEnvironment.ACTIVE_ENV : lambdaEnvironment.FAILOVER_ENV  } vpc endpoint`)
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
            if (cloudfrontSettings.switching_to === lambdaEnvironment.ACTIVE_ENV) {
                defaultBehavior.TargetOriginId = cloudfrontConfig.behaviors[0].active_origin;
            } else {
                defaultBehavior.TargetOriginId = cloudfrontConfig.behaviors[0].failover_origin;
            }
            const cacheBehaviors = distributionConfig.CacheBehaviors.Items;
            for (const behavior of cloudfrontConfig.behaviors) {
                const activeOrigin = behavior.active_origin;
                const failoverOrigin = behavior.failover_origin;

                for (const cacheBehavior of cacheBehaviors) {
                    if (cloudfrontSettings.switching_to === lambdaEnvironment.ACTIVE_ENV && cacheBehavior.TargetOriginId === failoverOrigin) {
                        cacheBehavior.TargetOriginId = activeOrigin;
                    } else if (cloudfrontSettings.switching_to === lambdaEnvironment.FAILOVER_ENV && cacheBehavior.TargetOriginId === activeOrigin) {
                        cacheBehavior.TargetOriginId = failoverOrigin;
                    }
                }
            }
    
            await cloudfront.updateDistribution({
                Id: distribution.id,
                DistributionConfig: distributionConfig,
                IfMatch: data.ETag
            }).promise();

            await cloudfront.createInvalidation({
                DistributionId: distribution.id,
                InvalidationBatch: {
                  CallerReference: `${Date.now()}`,
                  Paths: {
                    Quantity: 1,
                    Items: ['/*'] // Invalidate all objects in the distribution
                  }
                }
              }).promise();
        }

    } catch (error) {
        console.error('Error updating CloudFront behaviors:', error);
    }
}   

const mainFunction = async () => {
    program
    .version('0.0.1')
    .argument('<file>', 'File to read')
    .argument('<file>', 'File to read')
    .parse(process.argv);

    const file = program.args[0];
    if (!file) {
        console.error('Please provide a file to read.');
        process.exit(1);
      }

    let envs = await readAndParseFile(file)

    const currentEnvironment = envs.switching_to;
    await processCloudFront(envs);
    await processLambda(envs, false, 0);
    await processLambda(envs, true, 10);
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
