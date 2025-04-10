const AWS = require('aws-sdk');
const chalk = require('chalk');
const { custom_logging } = require('../helper.js');

const listEventBuses = async (region) => {
  const eventBridge = new AWS.EventBridge({ region });
  const result = await eventBridge.listEventBuses().promise();
  return result.EventBuses;
};

const listRules = async (region, busName) => {
  const eventBridge = new AWS.EventBridge({ region });
  const result = await eventBridge.listRules({ EventBusName: busName }).promise();
  return result.Rules;
};

const isManagedRule = (rule) => {
  return rule.ManagedBy && rule.ManagedBy !== ""; // AWS-managed rules have this field set
};

const enableRule = async (region, rule, busName) => {
  const eventBridge = new AWS.EventBridge({ region });

  if (isManagedRule(rule)) {
    custom_logging(chalk.yellow(`Skipping managed rule: ${rule.Name} on ${busName} in ${region}`));
    return;
  }

  if (global.dryRun) {
    custom_logging(chalk.cyan(`[DRY RUN] Would enable rule ${rule.Name} on ${busName} in ${region}`));
  } else {
    await eventBridge.enableRule({ Name: rule.Name, EventBusName: busName }).promise();
    custom_logging(chalk.green(`Enabled rule ${rule.Name} on ${busName} in ${region}`));
  }
};

const disableRule = async (region, rule, busName) => {
  const eventBridge = new AWS.EventBridge({ region });

  if (isManagedRule(rule)) {
    custom_logging(chalk.yellow(`Skipping managed rule: ${rule.Name} on ${busName} in ${region}`));
    return;
  }

  if (global.dryRun) {
    custom_logging(chalk.cyan(`[DRY RUN] Would disable rule ${rule.Name} on ${busName} in ${region}`));
  } else {
    await eventBridge.disableRule({ Name: rule.Name, EventBusName: busName }).promise();
    custom_logging(chalk.red(`Disabled rule ${rule.Name} on ${busName} in ${region}`));
  }
};

module.exports = { listEventBuses, listRules, enableRule, disableRule };