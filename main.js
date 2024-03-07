// Imports
const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const {searchType, awsEnvironment}  = require ('./helper/enum.js')
const readFileAsync = promisify(fs.readFile);
const { listLambdas, modifyLambdaConcurrency } = require('./helper/aws/lambda.js')
const {  modifyEventBridgeRules } = require('./helper/aws/eventbridge.js')
const {  modifyVpnConnectionRoute } = require('./helper/aws/ec2.js')
const {  updateDistribution, createInvalidation } = require('./helper/aws/cloudfront.js')


const processLambda = async (environmentConfig) => {
    try
    {
        let activeEnvLambdaProperties, activeEnvEventbridgeClient, activeEnvLambdaClient, activeEnvEnable, activeEnvConcurrency
        let failoverEnvLambdaProperties, failoverEnvEventbridgeClient, failoverEnvLambdaClient, failoverEnvEnable, failoverEnvConcurrency
    
        activeEnvLambdaProperties = environmentConfig.active_lambdas
        activeEnvEventbridgeClient = new AWS.EventBridge({ region: environmentConfig.active_region });
        activeEnvLambdaClient = new AWS.Lambda({ region:environmentConfig.active_region });
    
        failoverEnvLambdaProperties = environmentConfig.failover_lambdas
        failoverEnvEventbridgeClient = new AWS.EventBridge({ region: environmentConfig.failover_region });
        failoverEnvLambdaClient = new AWS.Lambda({ region:environmentConfig.failover_region });

        if (environmentConfig.switching_to === awsEnvironment.ACTIVE_ENV) {
            activeEnvEnable = true
            activeEnvConcurrency = 1
            failoverEnvEnable = false
            failoverEnvConcurrency = 0
        }
        else {
            activeEnvEnable = false
            activeEnvConcurrency = 0
            failoverEnvEnable = true
            failoverEnvConcurrency = 1
        }

        let activeEnvLambdaArns = []
        let failoverEnvLambdaArns = []
        
        if (searchType.ARN == activeEnvLambdaProperties.type) {
            console.log("Lambda arn was provided");
            activeEnvLambdaArns = activeEnvLambdaProperties.items
            failoverEnvLambdaArns = failoverEnvLambdaProperties.items
        }
        else if (searchType.PREFIX == activeEnvLambdaProperties.type) {
            console.log("Lambda prefix was provided");
            for (let item of activeEnvLambdaProperties.items) {
                let lambdaArns = await listLambdas(activeEnvLambdaClient, item)
                activeEnvLambdaArns = activeEnvLambdaArns.concat(lambdaArns)
            }
            for (let item of failoverEnvLambdaProperties.items) {
                let lambdaArns = await listLambdas(failoverEnvLambdaClient, item)
                failoverEnvLambdaArns = failoverEnvLambdaArns.concat(lambdaArns)
            }
        }
        else {
            console.log("No Lambda arn and no Lambda prefix was provided");
            activeEnvLambdaArns = await listLambdas(activeEnvLambdaClient)
            failoverEnvLambdaArns = await listLambdas(failoverEnvLambdaClient)
        }
        await modifyLambdaConcurrency(activeEnvLambdaClient, aggregateActiveEnvLambdaArns, activeEnvConcurrency)
        await modifyLambdaConcurrency(failoverEnvLambdaClient, aggregateFailoverEnvLambdaArns, failoverEnvConcurrency)
        await modifyEventBridgeRules(activeEnvEventbridgeClient, aggregateActiveEnvLambdaArns, activeEnvEnable)
        await modifyEventBridgeRules(failoverEnvEventbridgeClient, aggregateFailoverEnvLambdaArns, failoverEnvEnable)   
    }
    catch (error) {
        console.error('Error:', error);
    }
};

const processVpnEndpoint = async (environmentConfig) => {
    console.log("Processing VPN ENDPOINT")
    let ec2toAddIpsClient, ec2toRemoveIpsClient, endPointsToAddIpsFrom, endPointsToRemoveIpsFrom;
    let ips = environmentConfig.vpn_endpoints.ips
    try {
         if (environmentConfig.switching_to === awsEnvironment.ACTIVE_ENV) {
            ec2toAddIpsClient = new AWS.EC2 ({region: environmentConfig.active_region})
            ec2toRemoveIpsClient = new AWS.EC2 ({region: environmentConfig.failover_region})
            endPointsToAddIpsFrom = environmentConfig.vpn_endpoints.active_vpn_endpoints_id
            endPointsToRemoveIpsFrom = environmentConfig.vpn_endpoints.failover_vpn_endpoints_id;    
        }  
        else {
            ec2toAddIpsClient = new AWS.EC2 ({region: environmentConfig.failover_region})
            ec2toRemoveIpsClient = new AWS.EC2 ({region: environmentConfig.active_region})
            endPointsToAddIpsFrom = environmentConfig.vpn_endpoints.failover_vpn_endpoints_id
            endPointsToRemoveIpsFrom = environmentConfig.vpn_endpoints.active_vpn_endpoints_id;
        } 
        console.log(`Adding ips to ${environmentConfig.switching_to === awsEnvironment.ACTIVE_ENV ? awsEnvironment.ACTIVE_ENV : awsEnvironment.FAILOVER_ENV } vpc endpoint`)
        await modifyVpnConnectionRoute(ec2toAddIpsClient, endPointsToAddIpsFrom, ips, true)
    
        console.log(`Removing ips from ${environmentConfig.switching_to !== awsEnvironment.ACTIVE_ENV ? awsEnvironment.ACTIVE_ENV : awsEnvironment.FAILOVER_ENV  } vpc endpoint`)
        await modifyVpnConnectionRoute(ec2toRemoveIpsClient, endPointsToRemoveIpsFrom, ips, false)
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
            if (cloudfrontSettings.switching_to === awsEnvironment.ACTIVE_ENV) {
                defaultBehavior.TargetOriginId = cloudfrontConfig.behaviors[0].active_origin;
            } else {
                defaultBehavior.TargetOriginId = cloudfrontConfig.behaviors[0].failover_origin;
            }
            
            const cacheBehaviors = distributionConfig.CacheBehaviors.Items;
            for (const behavior of cloudfrontConfig.behaviors) {
                const activeOrigin = behavior.active_origin;
                const failoverOrigin = behavior.failover_origin;

                for (const cacheBehavior of cacheBehaviors) {
                    if (cloudfrontSettings.switching_to === awsEnvironment.ACTIVE_ENV && cacheBehavior.TargetOriginId === failoverOrigin) {
                        cacheBehavior.TargetOriginId = activeOrigin;
                    } else if (cloudfrontSettings.switching_to === awsEnvironment.FAILOVER_ENV && cacheBehavior.TargetOriginId === activeOrigin) {
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

    if (options.processAll || options.processCloudFront)
        await processCloudFront(envs);
    if (options.processAll || options.processLambda)
        await processLambda(envs);
    if (options.processAll || options.processVpnEndpoint)
        await processVpnEndpoint(envs)
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
