const AWS = require('aws-sdk');
const fs = require('fs');
const { promisify } = require('util');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { custom_logging } = require('../../helper/helper.js');
const { 
  putBucketNotificationConfiguration,
  getBucketNotificationConfiguration,
  deleteBucketNotificationConfiguration,
} = require('../../helper/aws/s3.js');

const readFileAsync = promisify(fs.readFile);
global.DRY_RUN = false;

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5,
  retryDelayOptions: { base: 200 },
});

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const updateArnRegion = (arn, sourceRegion, targetRegion) => {
  if (arn.includes(`:${sourceRegion}:`)) {
    return arn.replace(`:${sourceRegion}:`, `:${targetRegion}:`);
  }
  return arn;
};

const copyS3EventNotifications = async (s3Settings, processCurrentEnv) => {
  custom_logging(chalk.green("Starting S3 Event Notification Copy Process"));

  const sourceRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
  const targetRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.active_region : s3Settings.failover_region;

  for (const trigger of s3Settings.triggers) {
    const sourceBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
    const targetBucket = s3Settings.switching_to === "ACTIVE" ? trigger.active_bucket : trigger.failover_bucket;
    const sourceS3 = new AWS.S3({ region: sourceRegion });
    const targetS3 = new AWS.S3({ region: targetRegion });

    try {
      custom_logging(chalk.green(`Fetching event notifications from ${sourceBucket} in ${sourceRegion}`));
      const sourceNotificationConfig = await getBucketNotificationConfiguration(sourceS3, sourceBucket);

      custom_logging(chalk.blue(`Fetched Configuration for ${sourceBucket}:`));
      custom_logging(JSON.stringify(sourceNotificationConfig, null, 2));

      const updatedNotificationConfig = JSON.parse(JSON.stringify(sourceNotificationConfig));

      if (updatedNotificationConfig.TopicConfigurations) {
        updatedNotificationConfig.TopicConfigurations.forEach(config => {
          config.TopicArn = updateArnRegion(config.TopicArn, sourceRegion, targetRegion);
        });
      }
      if (updatedNotificationConfig.QueueConfigurations) {
        updatedNotificationConfig.QueueConfigurations.forEach(config => {
          config.QueueArn = updateArnRegion(config.QueueArn, sourceRegion, targetRegion);
        });
      }
      if (updatedNotificationConfig.LambdaFunctionConfigurations) {
        updatedNotificationConfig.LambdaFunctionConfigurations.forEach(config => {
          config.LambdaFunctionArn = updateArnRegion(config.LambdaFunctionArn, sourceRegion, targetRegion);
        });
      }

      custom_logging(chalk.yellow(`Updated Configuration for ${targetBucket}:`));
      custom_logging(JSON.stringify(updatedNotificationConfig, null, 2));

      if (!global.DRY_RUN) {
        await putBucketNotificationConfiguration(targetS3, targetBucket, updatedNotificationConfig);
        custom_logging(chalk.green(`Successfully applied event notifications to ${targetBucket} in ${targetRegion}`));
      } else {
        custom_logging(chalk.yellow(`[DRY RUN] Would apply event notifications to ${targetBucket} in ${targetRegion}`));
      }
    } catch (error) {
      custom_logging(chalk.red(`Error copying notifications for ${sourceBucket}: ${error.message}`));
      throw error;
    }
  }

  if (processCurrentEnv) {
    for (const trigger of s3Settings.triggers) {
      const currentRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
      const currentBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
      const s3Client = new AWS.S3({ region: currentRegion });

      custom_logging(chalk.yellow(`Deleting event notifications from ${currentBucket} in ${currentRegion}`));
      
      if (!global.DRY_RUN) {
        await deleteBucketNotificationConfiguration(s3Client, currentBucket);
        custom_logging(chalk.green(`Successfully deleted event notifications from ${currentBucket} in ${currentRegion}`));
      } else {
        custom_logging(chalk.yellow(`[DRY RUN] Would delete event notifications from ${currentBucket} in ${currentRegion}`));
      }
    }
  }
};

const mainFunction = async () => {
  program
    .version('1.0.0')
    .option('-dr, --dryRun', "Dry run the process")
    .option('-pce, --processCurrentEnvironment', "Process current environment")
    .option('--s3-index <index>', 'Index of s3 resource to process')
    .parse(process.argv);

  global.SLEEP_TIME = 1000;

  const options = program.opts();
  global.DRY_RUN = options.dryRun || false;
  
  if (global.DRY_RUN) {
    custom_logging(chalk.yellow("Running in DRY RUN mode - no changes will be made"));
  }
  
  const configFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 's3', 'configuration.json');
  
  try {
    let config = await readAndParseFile(configFile);
    config['switching_to'] = process.env.SWITCHING_TO;
    const processCurrentEnv = process.env.PROCESS_CURRENT_ENV === 'true' || options.processCurrentEnvironment;

    if (options.s3Index !== undefined) {
      custom_logging(chalk.green(`Processing s3 resource at index: ${options.s3Index}`));
      const idx = parseInt(options.s3Index);
      if (idx >= 0 && idx < config.triggers.length) {
        config.triggers = [ config.triggers[idx] ]
      } else {
        custom_logging(chalk.red(`Index ${idx} out of bounds (0..${config.triggers.length - 1})`));
        return;
      }
    } else {
      custom_logging(chalk.yellow("Processing all s3 resources"));
    }
    
    custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);

    await copyS3EventNotifications(config, processCurrentEnv);
    custom_logging(chalk.green("Process completed successfully"));
  } catch (error) {
    custom_logging(chalk.red(`Error in main function: ${error.message}`));
    process.exit(1);
  }
};

mainFunction().catch(error => {
  custom_logging(chalk.red("Uncaught Error: ") + error.message);
  process.exit(1);
});