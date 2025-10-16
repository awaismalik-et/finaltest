const { custom_logging } = require("../helper.js");
const chalk = require("chalk");

//helper function to get the existing record
const getExistingRecord = async (route53, hostedZoneId, recordName, recordType) => {
  await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
  try {
    const records = await route53.listResourceRecordSets({ HostedZoneId: hostedZoneId }).promise();
    const found = records.ResourceRecordSets.find(
      r => r.Name.replace(/\.$/, '') === recordName && r.Type === recordType
    );

    if (!found)
      custom_logging(chalk.red(`Record ${recordName} (${recordType}) not found in hosted zone ${hostedZoneId}. Skipping...`));

    return found;

  } catch (err) {
    custom_logging(chalk.red(`Error fetching record ${recordName}: ${err.message}`));
  }
}

//updates route53 record
const updateRoute53Record = async (route53, hostedZoneId, recordName, recordType, newValues, ttl = 60) => {
  await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
  const params = {
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: 'UPSERT',
          ResourceRecordSet: {
            Name: recordName,
            Type: recordType,
            TTL: ttl,
            ResourceRecords: newValues.map(value => ({ Value: value }))
          }
        }
      ]
    }
  };

  if (global.DRY_RUN) {
    custom_logging(chalk.yellow(`[DRY RUN] Would update ${recordName} (${recordType}) → ${newValues.join(', ')}`));
    return;
  }

  try {
    const result = await route53.changeResourceRecordSets(params).promise();
    custom_logging(chalk.green(`Updated ${recordName} (${recordType}) → ${newValues.join(', ')}`));
    return result;
  } catch (err) {
    custom_logging(chalk.red(`Error updating ${recordName}: ${err.message}`));
  }
}

module.exports = { getExistingRecord, updateRoute53Record };