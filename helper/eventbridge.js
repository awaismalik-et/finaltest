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

module.exports = [
    listAndDisableEventBridgeRules,
    listAndEnableEventBridgeRules
]
