const { custom_logging }  = require ('../helper.js')

const modifyEventBridgeRules = async (eventbridge, lambdaProperties, enable) => {
    const action = enable ? 'enabled' : 'disabled';
    for (const arn of lambdaProperties) {
        const params = { TargetArn: arn };
        const rules = await eventbridge.listRuleNamesByTarget(params).promise();
        const ruleNames = rules.RuleNames;
        for (const ruleName of ruleNames) {
            if (!global.DRY_RUN) {
                await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
                await (enable ? eventbridge.enableRule({ Name: ruleName }).promise() : eventbridge.disableRule({ Name: ruleName }).promise());
            }
            custom_logging(`Rule '${ruleName}' ${action}`);
        }
    }
}

module.exports = {
    modifyEventBridgeRules
}
