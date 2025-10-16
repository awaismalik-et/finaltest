const { custom_logging } = require('../../helper/helper.js');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const AWS = require('aws-sdk');
const { awsEnvironment } = require('../../helper/enum.js');
const { getExistingRecord, updateRoute53Record } = require("../../helper/aws/route53.js");
const readFileAsync = promisify(fs.readFile);
async function readAndParseFile(file) {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
}

const route53 = new AWS.Route53();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5,
  retryDelayOptions: { base: 200 }
});


//This function loops through each record of each hosted zone and calls updateroute53record for each
async function processRoute53(config) {
  const switchingTo = config.switching_to;
  custom_logging(chalk.green(`Starting Route53 switching to ${switchingTo}`));

  for (const route of config.routes) {
    const hostedZoneId = route.hosted_zone_id;
    custom_logging(chalk.blue(`Processing hosted zone: ${hostedZoneId}`));
    try {
        for (const record of route.records) {
          const targetValues =
            switchingTo === awsEnvironment.ACTIVE_ENV
              ? record.active
              : record.failover;

        // Fetch the existing record to get TTL and validate existence
        const existingRecord = await getExistingRecord(route53, hostedZoneId, record.dns, record.type);

        if (!existingRecord) {
          continue;
        }

        const ttl = existingRecord.TTL || 300;  //fallback to 300 if TTL doesnot exist
        await updateRoute53Record(route53, hostedZoneId, record.dns, record.type, targetValues, ttl);
        }
    } catch (err) {
      custom_logging(chalk.red(`Error processing hosted zone ${hostedZoneId}: ${err.message}`));
    }
  }

  custom_logging(chalk.green('Route53 process completed.'));
}

//This function changes the config if an index is provided and adds switching to and client name to the config
async function processFiles(file, options) {
  if (!fs.existsSync(file)) {
    custom_logging(chalk.red(`Configuration file not found: ${file}, skipping...`));
    return;
  }

  const config = await readAndParseFile(file);
  config['switching_to'] = process.env.SWITCHING_TO;
  config['CLIENT_NAME'] = process.env.CLIENT_NAME;

  if (options.route53Index !== undefined) {
    const idx = parseInt(options.route53Index);
    if (idx < 0 || idx >= config.routes.length) {
      custom_logging(chalk.red(`Index ${idx} out of bounds (0..${config.routes.length - 1})`));
      return;
    }
    config.routes = [config.routes[idx]];
  }

  await processRoute53(config);
}

async function mainFunction() {
  program
    .version('0.0.1')
    .option('-dr --dryRun', 'Dry run the process')
    .option('--route53-index <index>', 'Index of Route53 hosted zone to process')
    .parse(process.argv);

  const options = program.opts();

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow('DRY RUN is enabled'));
  } else {
    custom_logging(chalk.red('DRY RUN is disabled'));
  }

  if (options.route53Index !== undefined) {
    custom_logging(chalk.green(`Processing Route53 hosted zone at index: ${options.route53Index}`));
  } else {
    custom_logging(chalk.yellow('Processing all Route53 hosted zones'));
  }

  const clientFile = path.resolve( __dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'route53', 'configuration.json' );

  await processFiles(clientFile, options);
  custom_logging(chalk.green('Process completed.'));
}

mainFunction()
  .then(() => custom_logging(chalk.green('Exiting...')))
  .catch(err => custom_logging(chalk.red('Error: ') + err.message));
