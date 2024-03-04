// Imports
const path = require('path');
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda({ region: "us-east-1" });
const dotenv = require('dotenv');
const { uuid } = require('uuidv4');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

let DISTRIBUTION_ID = process.env.DISTRIBUTION_ID;

const processEnvironment = async (envLambdaArn, envLambdaPrefix, envName, enable, region) => {
    const eventbridge = new AWS.EventBridge({ region });
    try {
        if (!envLambdaArn) {
            if (!envLambdaPrefix) {
                console.log(`No lambda arn or lambda prefix provided, ${enable ? 'enabling' : 'disabling'} all the crons from ${envName} environment`);
                await listAndModifyFunctions();
                await (enable ? listAndEnableEventBridgeRules(eventbridge) : listAndDisableEventBridgeRules(eventbridge));
            } else {
                console.log("Lambda prefix was provided");
                await listAndUpdateLambdaConcurrency(envLambdaPrefix);

                const rules = await eventbridge.listRules({ NamePrefix: envLambdaPrefix }).promise();
                for (const rule of rules.Rules) {
                    await (enable ? eventbridge.enableRule({ Name: rule.Name }).promise() : eventbridge.disableRule({ Name: rule.Name }).promise());
                }
            }
        } else {
            console.log("Lambda arn was provided");
            const targetArns = envLambdaArn.split(",");
            for (const arn of targetArns) {
                const lambdaArnParams = {
                    FunctionName: arn,
                    ReservedConcurrentExecutions: 0
                };
                await lambda.putFunctionConcurrency(lambdaArnParams).promise();
                const params = { TargetArn: arn };
                try {
                    const rules = await eventbridge.listRuleNamesByTarget(params).promise();
                    const ruleNames = rules.RuleNames;
                    console.log(ruleNames);
                    for (const ruleName of ruleNames) {
                        await (enable ? eventbridge.enableRule({ Name: ruleName }).promise() : eventbridge.disableRule({ Name: ruleName }).promise());
                    }
                } catch (error) {
                    console.error('Error:', error);
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

const updateCloudFrontOriginDomain = async (distributionId, oldDomainName, newDomainName) => {
    const cloudfront = new AWS.CloudFront();
    try {
        const data = await cloudfront.getDistributionConfig({ Id: distributionId }).promise();
        const distributionConfig = data.DistributionConfig;
        // Update the origin domain name to point to the new bucket
        distributionConfig.Origins.Items.forEach((origin) => {
            if (origin.DomainName.startsWith(oldDomainName)) {
                origin.DomainName = newDomainName;
            }
        });
        await cloudfront.updateDistribution({
            Id: distributionId,
            DistributionConfig: distributionConfig,
            IfMatch: data.ETag
        }).promise();
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
    await cloudfront.createInvalidation({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `${Date.now()}`,
          Paths: {
            Quantity: 1,
            Items: ['/*'] // Invalidate all objects in the distribution
          }
        }
      }).promise();
    
  
};

const listAndDisableEventBridgeRules = async (eventbridge) => {
    try {
        let params = {};
        let allRules = [];
        do {
            const data = await eventbridge.listRules(params).promise();
            allRules = allRules.concat(data.Rules);
            params.NextToken = data.NextToken;
        } while (params.NextToken);
        // Disable each rule
        for (const rule of allRules) {
            await eventbridge.disableRule({ Name: rule.Name }).promise();
            console.log(`Rule "${rule.Name}" disabled.`);
        }
        console.log('All EventBridge rules disabled successfully.');
    } catch (error) {
        console.error('Error listing or disabling EventBridge rules:', error);
        throw error;
    }
};

const listAndEnableEventBridgeRules = async (eventbridge) => {
    try {
        let params = {};
        let allRules = [];
        do {
            const data = await eventbridge.listRules(params).promise();
            allRules = allRules.concat(data.Rules);
            params.NextToken = data.NextToken;
        } while (params.NextToken);
        // enable each rule
        for (const rule of allRules) {
            await eventbridge.enableRule({ Name: rule.Name }).promise();
            console.log(`Rule "${rule.Name}" disabled.`);
        }
        console.log('All EventBridge rules disabled successfully.');
    } catch (error) {
        console.error('Error listing or disabling EventBridge rules:', error);
        throw error;
    }
};

const listAndModifyFunctions = async (prefix = "") => {
    try {
        let functionsWithPrefix = [];
        let nextMarker = null;
        do {
            const listParams = {
                MaxItems: 100,
                Marker: nextMarker
            };
            const data = await lambda.listFunctions(listParams).promise();
            console.log(data);
            const functionsFiltered = data.Functions.filter(func => func.FunctionName.startsWith(prefix));
            functionsWithPrefix.push(...functionsFiltered);
            nextMarker = data.NextMarker;
            for (const func of functionsFiltered) {
                const updateParams = {
                    FunctionName: func.FunctionName,
                    ReservedConcurrentExecutions: 0
                };
                await lambda.putFunctionConcurrency(updateParams).promise();
                console.log(`Updated concurrency for ${func.FunctionName}`);
            }
        } while (nextMarker);
        functionsWithPrefix.forEach(func => {
            console.log(func.FunctionName);
        });
    } catch (err) {
        console.log("Error:", err);
    }
};

const mainFunction = async () => {
    const environments = {
        PROD: {
            currentAwsRegion: process.env.PROD_REGION,
            previousAwsRegion: process.env.DR_REGION,
            currentOriginGroup: process.env.PROD_ORIGIN_GROUP,
            previousOriginGroup: process.env.DR_ORIGIN_GROUP,
            currentEnvLambdaArn: process.env.PROD_LAMBDA_ARNS,
            currentEnvLambdaPrefix: process.env.PROD_LAMBDA_PREFIX,
            previousEnvLambdaArn: process.env.DR_LAMBDA_ARNS,
            previousEnvLambdaPrefix: process.env.DR_LAMBDA_PREFIX,
            previousEnvironment: "DR"
        },
        DR: {
            currentAwsRegion: process.env.DR_REGION,
            previousAwsRegion: process.env.PROD_REGION,
            currentOriginGroup: process.env.DR_ORIGIN_GROUP,
            previousOriginGroup: process.env.PROD_ORIGIN_GROUP,
            currentEnvLambdaArn: process.env.DR_LAMBDA_ARNS,
            currentEnvLambdaPrefix: process.env.DR_LAMBDA_PREFIX,
            previousEnvLambdaArn: process.env.PROD_LAMBDA_ARNS,
            previousEnvLambdaPrefix: process.env.PROD_LAMBDA_PREFIX,
            previousEnvironment: "PROD"
        }
    };
    const currentEnvironment = process.env.SWITCHING_TO;
    const currentEnv = environments[currentEnvironment];
    await updateCloudFrontOriginDomain(DISTRIBUTION_ID, currentEnv.previousOriginGroup, currentEnv.currentOriginGroup);
    await processEnvironment(currentEnv.previousEnvLambdaArn, currentEnv.previousEnvLambdaPrefix, currentEnv.previousEnvironment, false, currentEnv.previousAwsRegion);
    await processEnvironment(currentEnv.currentEnvLambdaArn, currentEnv.currentEnvLambdaPrefix, currentEnvironment, true, currentEnv.currentAwsRegion);
};

mainFunction()
    .then(() => {
        console.log("Process completed");
    })
    .catch((error) => {
        console.error('Error:', error);
    });
