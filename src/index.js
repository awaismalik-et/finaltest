// Imports
const AWS = require('aws-sdk');
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const {lambdaType, lambdaEnvironment}  = require ('./enum.js')
const readFileAsync = promisify(fs.readFile);
const listAndModifyFunctions = require('../helper/lambda')
const { listAndDisableEventBridgeRules, listAndEnableEventBridgeRules } = require('../helper/eventbridge')


const processEnvironment = async (envLambdaProperties, envName, enable, concurrency, region) => {
    const eventbridge = new AWS.EventBridge({ region });
    const lambda = new AWS.Lambda({ region });
    try{
        if(lambdaType.ARN == envLambdaProperties.type){
            console.log("Lambda arn was provided");
            const targetArns = envLambdaProperties.items;
            for (const arn of targetArns) {
                const lambdaArnParams = {
                    FunctionName: arn,
                    ReservedConcurrentExecutions: concurrency
                };
                await lambda.putFunctionConcurrency(lambdaArnParams).promise();
                const params = { TargetArn: arn };
                try {
                    const rules = await eventbridge.listRuleNamesByTarget(params).promise();
                    const ruleNames = rules.RuleNames;
                    for (const ruleName of ruleNames) {
                        await (enable ? eventbridge.enableRule({ Name: ruleName }).promise() : eventbridge.disableRule({ Name: ruleName }).promise());
                    }
                } catch (error) {
                    console.error('Error:', error);
                }
            }
        }
        else if(lambdaType.PREFIX == envLambdaProperties.type){
            console.log("Lambda prefix was provided");
            for (const lambdaProperty of envLambdaProperties.items) {
                await listAndModifyFunctions(lambda, lambdaProperty, concurrency);
                const envLambdaPrefix = lambdaProperty;
                const rules = await eventbridge.listRules({ NamePrefix: envLambdaPrefix }).promise();
                for (const rule of rules.Rules) {
                  await (enable ? eventbridge.enableRule({ Name: rule.Name }).promise() : eventbridge.disableRule({ Name: rule.Name }).promise());
                }
              }
        }
        else{
                console.log(`No lambda arn or lambda prefix provided, ${enable ? 'enabling' : 'disabling'} all the crons from ${envName} environment`);
                await listAndModifyFunctions(lambda);
                await (enable ? listAndEnableEventBridgeRules(eventbridge) : listAndDisableEventBridgeRules(eventbridge));
        }   
    }
     catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

const addIpAddressesToDestinationVpnEndpoint = async (environmentConfig, currentEnvironment) => {
    const ec2 = new AWS.EC2({ region: currentEnvironment === lambdaEnvironment.ACTIVE_ENV ? environmentConfig.currentAwsRegion : environmentConfig.previousAwsRegion });
    let ips = environmentConfig.vpnEndpoints.ips
    let endPointsToAddIpsFrom = currentEnvironment === lambdaEnvironment.ACTIVE_ENV ? environmentConfig.vpnEndpoints.active_vpn_endpoints_id : environmentConfig.vpnEndpoints.failover_vpn_endpoints_id;
    let endPointsToRemoveIpsFrom = currentEnvironment !== lambdaEnvironment.ACTIVE_ENV ? environmentConfig.vpnEndpoints.active_vpn_endpoints_id : environmentConfig.vpnEndpoints.failover_vpn_endpoints_id;

    console.log(`Adding ips to ${currentEnvironment === lambdaEnvironment.ACTIVE_ENV ? lambdaEnvironment.ACTIVE_ENV : lambdaEnvironment.FAILOVER_ENV  } vpc endpoint`)

    for (const endpoint of endPointsToAddIpsFrom){
        for (const ip of ips){
            let params = {
                DestinationCidrBlock: `${ip}`, 
                VpnConnectionId: endpoint 
              };
              await ec2.createVpnConnectionRoute(params).promise()
        }
    }
    console.log(`Removing ips from ${currentEnvironment !== lambdaEnvironment.ACTIVE_ENV ? lambdaEnvironment.ACTIVE_ENV : lambdaEnvironment.FAILOVER_ENV  } vpc endpoint`)

    for (const endpoint of endPointsToRemoveIpsFrom){
        for (const ip of ips){
            let params = {
                DestinationCidrBlock: `${ip}`, 
                VpnConnectionId: endpoint 
              };
              await ec2.deleteVpnConnectionRoute(params).promise()
        }
    }
}

const updateCloudFrontOriginDomain = async (cloudfrontSettings) => {
    const cloudfront = new AWS.CloudFront();
    try {
        for (const distribution of cloudfrontSettings.cloudfront) {
            const data = await cloudfront.getDistributionConfig({ Id: distribution.id }).promise();
            const distributionConfig = data.DistributionConfig;
    
            // Find the CloudFront distribution configuration in the JSON
            const cloudfrontConfig = cloudfrontSettings.cloudfront.find(c => c.id === distribution.id);
            if (!cloudfrontConfig) {
                throw new Error(`CloudFront distribution with ID '${distribution.id}' not found in the JSON.`);
            }
    
            // Iterate through behaviors
            const defaultBehavior = distributionConfig.DefaultCacheBehavior;
            if (cloudfrontSettings.switching_to === lambdaEnvironment.ACTIVE_ENV) {
                defaultBehavior.TargetOriginId = cloudfrontConfig.behaviors[0].active_origin;
            } else {
                defaultBehavior.TargetOriginId = cloudfrontConfig.behaviors[0].failover_origin;
            }

            // Update behaviors in CacheBehaviors
            const cacheBehaviors = distributionConfig.CacheBehaviors.Items;
            for (const behavior of cloudfrontConfig.behaviors) {
                const activeOrigin = behavior.active_origin;
                const failoverOrigin = behavior.failover_origin;

                // Find and update behaviors based on switching_to value
                for (const cacheBehavior of cacheBehaviors) {
                    if (cloudfrontSettings.switching_to === lambdaEnvironment.ACTIVE_ENV && cacheBehavior.TargetOriginId === failoverOrigin) {
                        cacheBehavior.TargetOriginId = activeOrigin;
                    } else if (cloudfrontSettings.switching_to === lambdaEnvironment.FAILOVER_ENV && cacheBehavior.TargetOriginId === activeOrigin) {
                        cacheBehavior.TargetOriginId = failoverOrigin;
                    }
                }
            }
    
            // Update the distribution configuration
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
        throw error;
    }


}   

const mainFunction = async () => {
    program
    .version('0.0.1')
    .argument('<file>', 'File to read')
    .parse(process.argv);

    const file = program.args[0];
    if (!file) {
        console.error('Please provide a file to read.');
        process.exit(1);
      }

    let envs = await readAndParseFile(file)
    const environments = {
        PROD: {
            currentAwsRegion: envs.active_region,
            previousAwsRegion: envs.failover_region,
            currentLambdasProperties: envs.active_lambdas,
            previousLambdasProperties: envs.failover_lambdas,
            vpnEndpoints: envs.vpn_endpoints,
            previousEnvironment: lambdaEnvironment.FAILOVER_ENV
        },
        DR: {
            currentAwsRegion: envs.failover_region,
            previousAwsRegion: envs.active_region,
            currentLambdasProperties: envs.failover_lambdas,
            previousLambdasProperties: envs.active_lambdas,
            vpnEndpoints: envs.vpn_endpoints,
            previousEnvironment: lambdaEnvironment.ACTIVE_ENV
        }
    };
    const currentEnvironment = envs.switching_to;
    const currentEnv = environments[currentEnvironment];
    await updateCloudFrontOriginDomain(envs);
    await processEnvironment(currentEnv.previousLambdasProperties, currentEnv.previousEnvironment, false, 0, currentEnv.previousAwsRegion);
    await processEnvironment(currentEnv.currentLambdasProperties, currentEnv.currentEnvironment, true, 100, currentEnv.currentAwsRegion)
    await addIpAddressesToDestinationVpnEndpoint(currentEnv, currentEnvironment )     
};
async function readAndParseFile(file) {
    try {
      const data = await readFileAsync(file, { encoding: 'utf-8' });
      const dataToJson = JSON.parse(data);
      return dataToJson
    } catch (error) {
      console.error('Error reading or parsing file:', error);
    }
  }


mainFunction()
    .then(() => {
        console.log("Process completed");
    })
    .catch((error) => {
        console.error('Error:', error);
    });
