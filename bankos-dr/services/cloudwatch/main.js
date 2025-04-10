const { custom_logging , find_in_array_by_key_and_val }  = require ('../../helper/helper.js')
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const { awsEnvironment }  = require ('../../helper/enum.js')
const { modifyLambdaConcurrency } = require('../../helper/aws/lambda.js')
const {  modifyEventBridgeRules } = require('../../helper/aws/eventbridge.js')
const path = require('path');
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
const processLambda = async (environmentConfig) => {
    custom_logging(chalk.green("Starting process on Lambdas"))
    let currentEnvironment = awsEnvironment.ACTIVE_ENV;
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
        currentEnvironment = awsEnvironment.FAILOVER_ENV;
    }
    else {
        activeEnvEnable = false
        activeEnvConcurrency = 0
        failoverEnvEnable = true
        failoverEnvConcurrency = 1
    }

    let activeEnvLambdaArns = []
    let failoverEnvLambdaArns = []
    custom_logging(chalk.yellow(`Lambda ARNs will be processed for ${chalk.green(awsEnvironment.ACTIVE_ENV)} environment`));
    activeEnvLambdaArns = environmentConfig.active_lambdas.items
    failoverEnvLambdaArns = environmentConfig.failover_lambdas.items
    
    if (global.PROCESS_CURRENT_ENVIRONMENT || currentEnvironment === awsEnvironment.FAILOVER_ENV) {
        try {
            custom_logging(`Processing ${chalk.green(awsEnvironment.ACTIVE_ENV)} environment's lambdas/events`);
            await modifyLambdaConcurrency(activeEnvLambdaClient, activeEnvLambdaArns, activeEnvConcurrency)
            await modifyEventBridgeRules(activeEnvEventbridgeClient, activeEnvLambdaArns, activeEnvEnable)
        }
        catch (error) {
            custom_logging(chalk.red("Error: ") + error.message);
        }
    }
    
    if (global.PROCESS_CURRENT_ENVIRONMENT || currentEnvironment === awsEnvironment.ACTIVE_ENV) {
        try {
            custom_logging(`Processing ${chalk.green(awsEnvironment.FAILOVER_ENV)} environment's lambdas/events`);
            await modifyLambdaConcurrency(failoverEnvLambdaClient, failoverEnvLambdaArns, failoverEnvConcurrency)
            await modifyEventBridgeRules(failoverEnvEventbridgeClient, failoverEnvLambdaArns, failoverEnvEnable)   
        }
        catch (error) {
            custom_logging(chalk.red("Error: ") + error.message);
        }
    }
};

const processFiles = async(file) => {
    if (!fs.existsSync(file)) {
        custom_logging(chalk.red(`Configuration file not found: ${file}, skipping...`));
        return;
    }

    let file_config = await readAndParseFile(file);
    file_config['switching_to'] = process.env.SWITCHING_TO;
    file_config['CLIENT_NAME'] = process.env.CLIENT_NAME;

    custom_logging(`Switching to ${chalk.green(file_config.switching_to)} environment`);
    await processLambda(file_config);
}

const mainFunction = async () => {
    program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")

    .parse(process.argv);
    
    const options = program.opts();
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

    let commonFile = path.resolve(__dirname, '..', '..', 'configuration', 'common', 'cloudwatch', 'configuration.json');
    let clientFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'cloudwatch', 'configuration.json');

    await processFiles(commonFile)
    await processFiles(clientFile)
    custom_logging(chalk.green("Process has been completed"));
}    
    
mainFunction()
    .then(() => {
        custom_logging(chalk.green("Exiting ..."));
    })
    .catch((error) => {
        custom_logging(chalk.red("Error: ") + error.message);
    });
