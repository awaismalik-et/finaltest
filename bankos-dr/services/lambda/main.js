const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const path = require('path');
const { getBucketNotificationConfiguration, putBucketNotificationConfiguration } = require('../../helper/aws/s3.js')
const { custom_logging , find_in_array_by_key_and_val }  = require ('../../helper/helper.js')
const { addLambdaPermission, getEventSourceMapping, updateEventSourceMapping } = require('../../helper/aws/lambda.js')
const { awsEnvironment}  = require ('../../helper/enum.js')
const readFileAsync = promisify(fs.readFile);
async function readAndParseFile(file) {
    const data = await readFileAsync(file, { encoding: 'utf-8' });
    const dataToJson = JSON.parse(data);
    return dataToJson
  }

const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5, // Maximum number of retries
  retryDelayOptions: { 
    base: 200 // Base delay in milliseconds
  }
})

const processLambdaTriggers = async (environmentConfig) => {
    custom_logging(chalk.green("Starting process on Lamda triggers"))
    let addLambdaProperties, addS3Client, addLambdaClient
    let removeLambdaProperties, removeS3Client, removeLambdaClient
    if (environmentConfig.switching_to === awsEnvironment.ACTIVE_ENV) {
        addLambdaProperties = environmentConfig.active_lambda_triggers
        addS3Client = new AWS.S3({ region:environmentConfig.active_region });
        addLambdaClient = new AWS.Lambda({ region:environmentConfig.active_region });

        removeLambdaProperties = environmentConfig.failover_lambda_triggers
        removeS3Client = new AWS.S3({ region:environmentConfig.failover_region });
        removeLambdaClient = new AWS.Lambda({ region:environmentConfig.failover_region });
    }
    else
    {
        addLambdaProperties = environmentConfig.failover_lambda_triggers
        addS3Client = new AWS.S3({ region:environmentConfig.failover_region });
        addLambdaClient = new AWS.Lambda({ region:environmentConfig.failover_region });

        removeLambdaProperties = environmentConfig.active_lambda_triggers
        removeS3Client = new AWS.S3({ region:environmentConfig.active_region });
        removeLambdaClient = new AWS.Lambda({ region:environmentConfig.active_region });
    }

    if (global.PROCESS_CURRENT_ENVIRONMENT)
        await processRemovingLambdaS3AndSQSTriggers(removeLambdaProperties, removeS3Client, removeLambdaClient)
    await processAddingLambdaS3AndSQSTriggers(addLambdaProperties, addS3Client, addLambdaClient, environmentConfig)
}



const mainFunction = async () => {
    program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")

    .parse(process.argv);
    
    const options = program.opts();

    global.SLEEP_TIME = 1000;
    
    if (options.dryRun) {
        global.DRY_RUN = true;
        custom_logging(chalk.yellow("DRY RUN is enabled"));
    } else {
        custom_logging(chalk.red("DRY RUN is disabled"));
    }

    if (options.processCurrentEnvironment) {
        global.PROCESS_CURRENT_ENVIRONMENT = true;
        custom_logging(chalk.red("Current environment will be processed"));
    } else {
        custom_logging(chalk.yellow("Current environment will not be processed"));
    }

    let clientFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'lambda', 'configuration.json');
    
    await processFiles(clientFile);
    

    custom_logging(chalk.green("Process has been completed"));
}

const processFiles = async(file) => {
    if (!fs.existsSync(file)) {
        custom_logging(chalk.red(`Configuration file not found: ${file}, skipping...`));
        return;
    }

    let file_config = await readAndParseFile(file);
    file_config['switching_to'] = process.env.SWITCHING_TO;
    file_config['CLIENT_NAME'] = process.env.CLIENT_NAME;

    custom_logging(`Switching to ${chalk.green(file_config.switching_to)} environment`);
    await processLambdaTriggers(file_config);
}

const processAddingLambdaS3AndSQSTriggers = async(lambdas, s3Client, lambdaClient, environmentConfig) => {
    let region = null
    try {
        for (let lambda of lambdas) {
            if(environmentConfig.switching_to == "ACTIVE")
            {
                region = environmentConfig.active_region
                custom_logging(`Processing lambda ${chalk.red(lambda.arn)}`);
                await processAddS3Trigger(lambda, s3Client, lambdaClient, region)
                await processAddSQSTrigger(lambda, lambdaClient)
            }

            else
            {
                
                region = environmentConfig.failover_region
                custom_logging(`Processing lambda ${chalk.red(lambda.arn)}`);
                await processAddS3Trigger(lambda, s3Client, lambdaClient, region)
                await processAddSQSTrigger(lambda, lambdaClient)
                
            }
            
        }
    } catch (error) {
        custom_logging(chalk.red("Error: ") + error.message);
    }
}

const processAddS3Trigger = async(lambda, s3Client, lambdaClient, region ) => {
    for (let bucket of lambda.buckets) {
        custom_logging(`Adding trigger in bucket ${chalk.red(bucket.name)}`);
        let bucketNotificationConfiguration = await getBucketNotificationConfiguration(s3Client, bucket.name);
        lambdaConfig = {
            'LambdaFunctionArn': lambda.arn,
            'Events': bucket.events,
            Id: bucket.eventName,
        }
        if (bucket.hasOwnProperty('filter'))
            lambdaConfig["Filter"] = bucket.filter;
        isTrigerrAlreadyExists = find_in_array_by_key_and_val(bucketNotificationConfiguration.LambdaFunctionConfigurations, "Id", bucket.eventName)
        if (isTrigerrAlreadyExists) {
            custom_logging(`Trigger already exists for ID '${bucket.eventName}'`);
            continue;
        }
        const sts = new AWS.STS();
        const { Account: account_id} = await sts.getCallerIdentity({}).promise();
        lambdaConfig.LambdaFunctionArn = lambda.arn
        bucketNotificationConfiguration.LambdaFunctionConfigurations.push(lambdaConfig)

        custom_logging(`Adding trigger ID '${bucket.eventName}'`);
        await addLambdaPermission(lambdaClient, lambda.arn, "s3.amazonaws.com", `arn:aws:s3:::${bucket.name}`)
        await putBucketNotificationConfiguration(s3Client, bucket.name, bucketNotificationConfiguration)   
    }
}

const processAddSQSTrigger = async(lambda, lambdaClient) => {
    for (let sqs of lambda.sqs) {
        custom_logging(`Enabling trigger for ${chalk.red(sqs)}`);
        trigger = await getEventSourceMapping(lambdaClient, sqs)
        if (trigger) {
            await updateEventSourceMapping(lambdaClient, {
                UUID: sqs,
                Enabled: true
            })
            custom_logging(`Trigger ID '${sqs}' updated`);
        }
        else
            custom_logging(`Couldn't find Trigger ID '${sqs}'`);
    }
}


const processRemovingLambdaS3AndSQSTriggers = async(lambdas, s3Client, lambdaClient) => {
    try {
        for (let lambda of lambdas) {
            custom_logging(`Processing lambda ${chalk.red(lambda.arn)}`);
            await processRemoveS3Trigger(lambda, s3Client)
            await processRemoveSQSTrigger(lambda, lambdaClient)
        }
    } catch (error) {
        custom_logging(chalk.red("Error: ") + error.message);
    }
}

const processRemoveSQSTrigger = async(lambda, lambdaClient) => {
    for (let sqs of lambda.sqs) {
        custom_logging(`Disabling trigger for sqs`);
        trigger = await getEventSourceMapping(lambdaClient, sqs)
        if (trigger) {
            await updateEventSourceMapping(lambdaClient, {
                UUID: sqs,
                Enabled: false
            })
            custom_logging(`Trigger ID '${sqs}' updated`);
        }
        else
            custom_logging(`Couldn't find Trigger ID '${sqs}'`);
    }
}

const processRemoveS3Trigger = async(lambda, s3Client) => {
    for (let bucket of lambda.buckets) {
        custom_logging(`Removing Trigger in bucket ${chalk.red(bucket.name)}`);
        bucketNotificationConfiguration = await getBucketNotificationConfiguration(s3Client, bucket.name);
        trigger = find_in_array_by_key_and_val(bucketNotificationConfiguration.LambdaFunctionConfigurations, "Id", bucket.eventName)
        if (trigger) {  
            custom_logging(`Removing Trigger ID '${bucket.eventName}'`);
            itemIndex = bucketNotificationConfiguration.LambdaFunctionConfigurations.indexOf(trigger);
            bucketNotificationConfiguration.LambdaFunctionConfigurations.splice(itemIndex, 1)
            await putBucketNotificationConfiguration(s3Client, bucket.name, bucketNotificationConfiguration)   
        }
        else
            custom_logging(`Couldn't find Trigger ID '${bucket.eventName}'`);
    }
}

mainFunction()
    .then(() => {
        custom_logging(chalk.green("Exiting ..."));
    })
    .catch((error) => {
        custom_logging(chalk.red("Error: ") + error.message);
    });
