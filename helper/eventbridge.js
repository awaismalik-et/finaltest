const modifyEventBridgeRules = async (eventbridge, lambdaProperties, enable) => {
    const action = enable ? 'enabled' : 'disabled';
    for (const arn of lambdaProperties) {
        const params = { TargetArn: arn };
        const rules = await eventbridge.listRuleNamesByTarget(params).promise();
        const ruleNames = rules.RuleNames;
        for (const ruleName of ruleNames) {
            
            await (enable ? eventbridge.enableRule({ Name: ruleName }).promise() : eventbridge.disableRule({ Name: ruleName }).promise());
            console.log(`Rule '${ruleName}' ${action}`);
        }
    }
}

module.exports = {

    modifyEventBridgeRules
}
