const { custom_logging }  = require ('../helper.js')
const chalk = require('chalk');

const promoteSecondaryClusterToPrimary = async (elasticacheClient, params) => {
    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
    if (!global.DRY_RUN)
        await elasticacheClient.failoverGlobalReplicationGroup(params).promise()
    custom_logging(`${params.PrimaryReplicationGroupId} has been set as primary`);
}

module.exports = { promoteSecondaryClusterToPrimary }
