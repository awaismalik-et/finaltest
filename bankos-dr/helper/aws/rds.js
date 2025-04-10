const { custom_logging }  = require ('../helper.js')
const chalk = require('chalk');
const AWS = require('aws-sdk');
const prompt = require('prompt-sync')();

const initializeRdsClients = (environmentConfig) => {
    activeRdsClient = new AWS.RDS({ region: environmentConfig.active_region });
    failoverRdsClient = new AWS.RDS({ region: environmentConfig.failover_region });
    return {
        activeRdsClient,
        failoverRdsClient
    }
};

const describeDBInstances =async (rdsClient, getDbInstanceDetailsparams) => {
    let response = await rdsClient.describeDBInstances({DBInstanceIdentifier: getDbInstanceDetailsparams}).promise();
    return response
}

const checkIfRdsExists = async (rdsClient, getDbInstanceDetailsparams) => {
    let activeDbInstanceDetails = null
    try {
        activeDbInstanceDetails = await rdsClient.describeDBInstances(getDbInstanceDetailsparams).promise()
    }
    catch(error) {
        if (error.code == "DBInstanceNotFound")
            custom_logging(chalk.red("Error: ") + error.message);
    }
    return activeDbInstanceDetails

}

const createReadReplica = async (rdsClient, createReadReplicaParams) => {

    let response = await rdsClient.createDBInstanceReadReplica(createReadReplicaParams).promise()  
    while(response.DBInstance.DBInstanceStatus != "available") {
        custom_logging(chalk.yellow(`waiting for ${createReadReplicaParams.DBInstanceIdentifier} db instance to be in available state`));
        await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME * 60));
        response = await rdsClient.describeDBInstances({DBInstanceIdentifier: createReadReplicaParams.DBInstanceIdentifier}).promise()
        response = {
            "DBInstance" : response.DBInstances[0]
        }
    }
}

const promoteReadReplica =async (rdsClient, promoteReadReplicationParams) => {

    let response = await rdsClient.promoteReadReplica(promoteReadReplicationParams).promise()
    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME * 60));
    
    response = await rdsClient.describeDBInstances({DBInstanceIdentifier: promoteReadReplicationParams.DBInstanceIdentifier}).promise()
    while(response.DBInstances[0].DBInstanceStatus != "available") {
        custom_logging(chalk.yellow(`promoting ${promoteReadReplicationParams.DBInstanceIdentifier} to primary instance`));
        await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME * 60));
        response = await rdsClient.describeDBInstances({DBInstanceIdentifier: promoteReadReplicationParams.DBInstanceIdentifier}).promise()
    }
}

const describeDBProxies =async (rdsClient, getDbInstanceDetailsparams) => {
    let response = await rdsClient.describeDBInstances({DBInstanceIdentifier: getDbInstanceDetailsparams.DBInstanceIdentifier}).promise();
    return response
}

const updateRDSProxy =async (rdsClient, getDbInstanceDetailsparams) => {
    let response = await rdsClient.modifyDBProxy(getDbInstanceDetailsparams).promise();
    return response
}

const deleteDbInstance = async (rdsClient, deleteDbInstanceparams) => {
    await rdsClient.deleteDBInstance(deleteDbInstanceparams).promise();
};

module.exports = {
    initializeRdsClients,
    promoteReadReplica,
    checkIfRdsExists,
    deleteDbInstance,
    createReadReplica,
    describeDBInstances,
    describeDBProxies,
    updateRDSProxy
};
