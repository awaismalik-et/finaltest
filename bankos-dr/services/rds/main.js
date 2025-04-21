const { custom_logging, find_in_array_by_key_and_val } = require('../../helper/helper.js')
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
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

const {
    initializeRdsClients,
    deleteDbInstance,
    createReadReplica,
    promoteReadReplica,
    checkIfRdsExists,
    describeDBInstances,
    describeDBProxies,
    updateRDSProxy,
    registerDBProxyTargets,
    describeDBProxyTargetGroups,
    describeDBProxyTargets,
    deregisterDBProxyTargets
} = require('../../helper/aws/rds.js');

const updateProxyTargets = async (rdsClient, proxyName, newDbInstanceId) => {
    try {
        custom_logging(`Getting target groups for proxy ${proxyName}`);
        const targetGroups = await describeDBProxyTargetGroups(rdsClient, {
            DBProxyName: proxyName
        });
        
        if (!targetGroups.TargetGroups || targetGroups.TargetGroups.length === 0) {
            throw new Error(`No target group found for proxy ${proxyName}`);
        }
        
        const targetGroupName = targetGroups.TargetGroups[0].TargetGroupName;
        
        custom_logging(`Getting current targets for proxy ${proxyName} target group ${targetGroupName}`);
        const currentTargets = await describeDBProxyTargets(rdsClient, {
            DBProxyName: proxyName,
            TargetGroupName: targetGroupName
        });
        
        if (currentTargets.Targets && currentTargets.Targets.length > 0) {
            const dbInstanceIdentifiers = currentTargets.Targets
                .filter(target => target.Type === 'RDS_INSTANCE')
                .map(target => target.RdsResourceId);
            
            if (dbInstanceIdentifiers.length > 0) {
                custom_logging(`Deregistering existing targets: ${dbInstanceIdentifiers.join(', ')} from proxy ${proxyName}`);
                await deregisterDBProxyTargets(rdsClient, {
                    DBProxyName: proxyName,
                    TargetGroupName: targetGroupName,
                    DBInstanceIdentifiers: dbInstanceIdentifiers
                });
                
                custom_logging(chalk.yellow(`Waiting for target deregistration to complete...`));
                await new Promise(resolve => setTimeout(resolve, 15000));
            }
        }
        
        custom_logging(`Registering new target ${newDbInstanceId} with proxy ${proxyName}`);
        await registerDBProxyTargets(rdsClient, {
            DBProxyName: proxyName,
            TargetGroupName: targetGroupName,
            DBInstanceIdentifiers: [newDbInstanceId]
        });
        
        custom_logging(chalk.green(`Successfully updated targets for proxy ${proxyName}`));
    } catch (error) {
        custom_logging(chalk.red(`Error updating proxy targets: ${error.message}`));
        throw error;
    }
};

const waitForDbInstanceDeletion = async (rdsClient, deleteDbInstanceparams) => {
    let instanceExists = true;
    while (instanceExists) {
        try {
            await describeDBInstances(rdsClient, deleteDbInstanceparams)
            custom_logging(chalk.red(`Waiting for ${deleteDbInstanceparams} DB instance to be deleted.`))
            await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME * 60));
        } catch (error) {
            if (error.code === 'DBInstanceNotFound') {
                custom_logging(chalk.green(`${deleteDbInstanceparams} DB instance deleted successfully.`))
                instanceExists = false;
            } else {
                custom_logging(chalk.red("Error: An error occurred while waiting for DB deletion"));
                throw error;
            }
        }
    }
};

const waitForReplicaPromotionComplete = async (rdsClient, dbInstanceIdentifier) => {
    let promotionNotComplete = true;
    custom_logging(chalk.yellow(`Waiting for ${dbInstanceIdentifier} promotion to complete...`));
    
    while (promotionNotComplete) {
        try {
            const response = await rdsClient.describeDBInstances({
                DBInstanceIdentifier: dbInstanceIdentifier
            }).promise();
            
            const dbInstance = response.DBInstances[0];
            
            if (dbInstance && dbInstance.DBInstanceStatus === "available" && 
                (!dbInstance.ReadReplicaSourceDBInstanceIdentifier || dbInstance.ReadReplicaSourceDBInstanceIdentifier === '')) {
                
                if (dbInstance.BackupRetentionPeriod >= 0) { 
                    custom_logging(chalk.green(`${dbInstanceIdentifier} promotion is now complete. Current status: ${dbInstance.DBInstanceStatus}`));
                    promotionNotComplete = false; 
                } else {
                    custom_logging(chalk.yellow(`${dbInstanceIdentifier} promotion is still processing backup configurations.`));
                    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME ? global.SLEEP_TIME * 60 : 30000));
                }
            } else {
                custom_logging(chalk.yellow(`Waiting for ${dbInstanceIdentifier} promotion to complete. Current status: ${dbInstance.DBInstanceStatus}`));
                await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME ? global.SLEEP_TIME * 60 : 30000));
            }
        } catch (error) {
            custom_logging(chalk.red(`Error checking promotion status of ${dbInstanceIdentifier}: ${error.message}`));
            throw error;
        }
    }

    custom_logging(chalk.yellow(`Giving additional time for promotion processes to complete fully...`));
    await new Promise(resolve => setTimeout(resolve, 15000));
};

const waitForDbRenameComplete = async (rdsClient, oldName, newName) => {
    let renamingInProgress = true;
    custom_logging(chalk.yellow(`Waiting for DB rename from ${oldName} to ${newName} to complete...`));
    
    while (renamingInProgress) {
        try {
            const response = await rdsClient.describeDBInstances({
                DBInstanceIdentifier: newName
            }).promise();
            
            const dbInstance = response.DBInstances[0];
            
            if (dbInstance && dbInstance.DBInstanceStatus === "available") {
                custom_logging(chalk.green(`DB instance renamed to ${newName} and is now available.`));
                renamingInProgress = false;
            } else {
                custom_logging(chalk.yellow(`Waiting for renamed DB ${newName} to become available. Current status: ${dbInstance.DBInstanceStatus}`));
                await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME ? global.SLEEP_TIME * 60 : 30000));  // Wait before retrying
            }
        } catch (error) {
            try {
                await rdsClient.describeDBInstances({
                    DBInstanceIdentifier: oldName
                }).promise();
                
                custom_logging(chalk.yellow(`Original DB ${oldName} still exists. Waiting for rename operation to complete...`));
                await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME ? global.SLEEP_TIME * 60 : 30000));  // Wait before retrying
            } catch (innerError) {
                if (innerError.code === 'DBInstanceNotFound') {
                    custom_logging(chalk.yellow(`Original DB ${oldName} no longer exists. Waiting for ${newName} to become available...`));
                    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME ? global.SLEEP_TIME * 60 : 30000));  // Wait before retrying
                } else {
                    custom_logging(chalk.red(`Error checking DB instances: ${innerError.message}`));
                    throw innerError;
                }
            }
        }
    }
};

const modifyDBInstanceIdentifier = async (rds, dbInstanceIdentifier) => {
    const originalDbName = dbInstanceIdentifier.identifier;

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    
    const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;
    const newDbInstanceIdentifier = `${originalDbName}-${timestamp}`;
    
    try {
        await rds.modifyDBInstance({
            DBInstanceIdentifier: originalDbName,
            NewDBInstanceIdentifier: newDbInstanceIdentifier,
            ApplyImmediately: true
        }).promise();
        
        custom_logging(chalk.green(`Renaming DB instance ${originalDbName} to ${newDbInstanceIdentifier}...`));
        
        await waitForDbRenameComplete(rds, originalDbName, newDbInstanceIdentifier);
        
        return newDbInstanceIdentifier;
    } catch (err) {
        console.error(chalk.red('Error during the DB instance modification process:', err));
        throw err;
    }
};

const processRds = async (environmentConfig) => {
    custom_logging(chalk.green("Starting process on RDS"));
    const { activeRdsClient, failoverRdsClient } = initializeRdsClients(environmentConfig);
    const sts = new AWS.STS();
    try {
        for (let rdsConfig of environmentConfig.rds) {
            if (environmentConfig.switching_to == "ACTIVE") {
                custom_logging(`Checking if ${rdsConfig.active_configurations.identifier} already exists in ${environmentConfig.active_region}`);
                let getDbInstanceDetailsparams = { DBInstanceIdentifier: rdsConfig.active_configurations.identifier }
                let dbInstanceDetails = await checkIfRdsExists(activeRdsClient, getDbInstanceDetailsparams)
                let currentDateTime = new Date().toISOString();
                currentDateTime = currentDateTime.replaceAll("T", "-").replaceAll(":", "-").split(".")[0]

                if (dbInstanceDetails && dbInstanceDetails.DBInstances.length > 0) {
                    const dbInstance = dbInstanceDetails.DBInstances[0];
                    
                    if (dbInstance.ReadReplicaSourceDBInstanceIdentifier) {
                        custom_logging(chalk.yellow(`${rdsConfig.active_configurations.identifier} is already a read replica in ${environmentConfig.active_region}. Skipping deletion and creation.`));
                        
                        if (dbInstance.ReadReplicaSourceDBInstanceIdentifier.includes(rdsConfig.failover_configurations.identifier)) {
                            custom_logging(chalk.green(`The read replica is already replicating from the correct source. Proceeding with promotion.`));
                        } else {
                            custom_logging(chalk.yellow(`Warning: The read replica is replicating from ${dbInstance.ReadReplicaSourceDBInstanceIdentifier}, which differs from the expected source ${rdsConfig.failover_configurations.identifier}.`));
                        }
                    } else if (rdsConfig.force_delete) {
                        var deleteDbInstanceparams = {
                            DBInstanceIdentifier: rdsConfig.active_configurations.identifier,
                            FinalDBSnapshotIdentifier: rdsConfig.active_configurations.identifier + currentDateTime,
                            SkipFinalSnapshot: false
                        };
                        
                        custom_logging(chalk.red(`Deleting ${environmentConfig.active_region}'s ${rdsConfig.active_configurations.identifier}`));
                        await deleteDbInstance(activeRdsClient, deleteDbInstanceparams);
                        await waitForDbInstanceDeletion(activeRdsClient, deleteDbInstanceparams.DBInstanceIdentifier);
                    }
                }
                
                dbInstanceDetails = await checkIfRdsExists(activeRdsClient, getDbInstanceDetailsparams);
                if (!dbInstanceDetails || dbInstanceDetails.DBInstances.length === 0) {
                    const failoverDbDetails = await describeDBInstances(failoverRdsClient, rdsConfig.failover_configurations.identifier);
                    const { Account: accountId } = await sts.getCallerIdentity({}).promise();
                    
                    let createReadReplicaParams = {
                        DBInstanceIdentifier: rdsConfig.active_configurations.identifier,
                        SourceDBInstanceIdentifier: `arn:aws:rds:${environmentConfig.failover_region}:${accountId}:db:${rdsConfig.failover_configurations.identifier}`,
                        SourceRegion: environmentConfig.failover_region,
                        DBInstanceClass: failoverDbDetails.DBInstances[0].DBInstanceClass,
                        DBSubnetGroupName: rdsConfig.active_configurations.subnet_group_name,
                        VpcSecurityGroupIds: rdsConfig.active_configurations.security_group_ids
                    };
                    
                    if (rdsConfig.active_configurations.hasOwnProperty("kms_key_id") && rdsConfig.active_configurations.kms_key_id != "")
                        createReadReplicaParams['KmsKeyId'] = rdsConfig.active_configurations.kms_key_id;
                    
                    custom_logging(`Creating read-replica of ${rdsConfig.failover_configurations.identifier} in ${environmentConfig.active_region}`);
                    await createReadReplica(activeRdsClient, createReadReplicaParams);
                }

                custom_logging(`Promoting ${environmentConfig.active_region}'s ${rdsConfig.active_configurations.identifier} to primary`);
                let promoteFailoverParams = {
                    DBInstanceIdentifier: rdsConfig.active_configurations.identifier
                };

                await promoteReadReplica(activeRdsClient, promoteFailoverParams);
                await waitForReplicaPromotionComplete(activeRdsClient, rdsConfig.active_configurations.identifier);
                custom_logging(chalk.yellow(`${rdsConfig.active_configurations.identifier} is promoted in ${environmentConfig.active_region}, Please update your DBs connection in applications to newly created Primary RDS in ${environmentConfig.active_region}`))
                
                dbInstanceDetails = await describeDBInstances(activeRdsClient, rdsConfig.active_configurations.identifier);                
                custom_logging(`Getting ${rdsConfig.active_configurations.proxy_name} details in ${environmentConfig.active_region}`);
                let describeProxyParams = {
                    DBProxyName: rdsConfig.active_configurations.proxy_name,
                    DBInstanceIdentifier: dbInstanceDetails.DBInstances[0].DBInstanceIdentifier
                };

                let result = await describeDBProxies(activeRdsClient, describeProxyParams);

                let updateRDSProxyParams = {
                    DBProxyName: rdsConfig.active_configurations.proxy_name,
                    Auth: result.Auth,
                    IdleClientTimeout: result.IdleClientTimeout,
                    DebugLogging: result.DebugLogging,
                    RequireTLS: result.RequireTLS,
                    RoleArn: result.RoleArn
                };

                custom_logging(`Updating ${rdsConfig.active_configurations.proxy_name} details in ${environmentConfig.active_region}`);
                await updateRDSProxy(activeRdsClient, updateRDSProxyParams);

                custom_logging(`Registering ${rdsConfig.active_configurations.identifier} with proxy ${rdsConfig.active_configurations.proxy_name} in ${environmentConfig.active_region}`);
                
                await updateProxyTargets(activeRdsClient, rdsConfig.active_configurations.proxy_name, rdsConfig.active_configurations.identifier);

                if (global.PROCESS_CURRENT_ENVIRONMENT) {
                    let renamedActiveInstanceId = await modifyDBInstanceIdentifier(failoverRdsClient, rdsConfig.failover_configurations);
                    
                    custom_logging(chalk.green(`Successfully renamed to ${renamedActiveInstanceId}`));

                    let oldDbInstanceDetails = await describeDBInstances(failoverRdsClient, renamedActiveInstanceId);
                    const oldDbInstance = oldDbInstanceDetails.DBInstances[0];
                    const { Account: accountId } = await sts.getCallerIdentity({}).promise();

                    let createReadReplicaParams = {
                        DBInstanceIdentifier: rdsConfig.active_configurations.identifier,
                        SourceDBInstanceIdentifier: `arn:aws:rds:${environmentConfig.active_region}:${accountId}:db:${rdsConfig.active_configurations.identifier}`,
                        SourceRegion: environmentConfig.active_region,
                        DBInstanceClass: oldDbInstance.DBInstanceClass,
                        DBSubnetGroupName: rdsConfig.failover_configurations.subnet_group_name,
                        VpcSecurityGroupIds: rdsConfig.failover_configurations.security_group_ids,
                        OptionGroupName: oldDbInstance.OptionGroupMemberships[0].OptionGroupName
                    };

                    if (rdsConfig.failover_configurations.hasOwnProperty("kms_key_id") && rdsConfig.active_configurations.kms_key_id != "")
                        createReadReplicaParams['KmsKeyId'] = rdsConfig.failover_configurations.kms_key_id

                    custom_logging(`Creating read-replica of ${rdsConfig.active_configurations.identifier} in ${environmentConfig.failover_region}`);
                    await createReadReplica(failoverRdsClient, createReadReplicaParams);
                    custom_logging(chalk.green(`Successfully created read-replica of ${rdsConfig.failover_configurations.identifier} in ${environmentConfig.active_region}`));
                }

                custom_logging(chalk.yellow(`${rdsConfig.active_configurations.identifier} is now the primary in ${environmentConfig.active_region}`));
                if (global.PROCESS_CURRENT_ENVIRONMENT) {
                    custom_logging(chalk.yellow(`${rdsConfig.active_configurations.identifier} is now a read replica in ${environmentConfig.failover_region}`));
                }
            } 
            else {
                let getReplicaInstanceDetailsparams = { DBInstanceIdentifier: rdsConfig.active_configurations.replica_configuration.identifer }
                let dbInstaceDetails = await checkIfRdsExists(activeRdsClient, getReplicaInstanceDetailsparams)
                if (rdsConfig.active_configurations.replica_configuration && 
                    rdsConfig.active_configurations.replica_configuration.identifier && dbInstaceDetails) {
                    
                    custom_logging(chalk.yellow(`Active configuration contains replica information. Creating replicas in failover region first...`));
                    try {
                        custom_logging(chalk.green(`Creating replica ${rdsConfig.failover_configurations.identifier} in ${environmentConfig.failover_region}`));
                        
                        const dbInstanceDetails = await describeDBInstances(activeRdsClient, rdsConfig.active_configurations.identifier);
                        const { Account: accountId} = await sts.getCallerIdentity({}).promise();
                        
                        const createReplicaParams = {
                            DBInstanceIdentifier: rdsConfig.failover_configurations.identifier,
                            SourceDBInstanceIdentifier: `arn:aws:rds:${environmentConfig.active_region}:${accountId}:db:${rdsConfig.active_configurations.identifier}`,
                            DBInstanceClass: dbInstanceDetails.DBInstances[0].DBInstanceClass,
                            DBSubnetGroupName: rdsConfig.failover_configurations.subnet_group_name,
                            VpcSecurityGroupIds: rdsConfig.failover_configurations.security_group_ids
                        };
                        
                        if (rdsConfig.failover_configurations.hasOwnProperty("kms_key_id") && 
                            rdsConfig.failover_configurations.kms_key_id !== "") {
                            createReplicaParams['KmsKeyId'] = rdsConfig.failover_configurations.kms_key_id;
                        }
                        
                        await createReadReplica(failoverRdsClient, createReplicaParams);
                        custom_logging(chalk.green(`Successfully created replica in ${environmentConfig.failover_region}`));
                    } catch (error) {
                        custom_logging(chalk.red(`Error creating replica in failover region: ${error.message}`));
                        throw error;
                    }
                }
                custom_logging(`Promoting ${environmentConfig.failover_region}'s ${rdsConfig.failover_configurations.identifier} to primary`);
                let promoteActiveParams = {
                    DBInstanceIdentifier: rdsConfig.failover_configurations.identifier
                };
                
                await promoteReadReplica(failoverRdsClient, promoteActiveParams);
                await waitForReplicaPromotionComplete(failoverRdsClient, rdsConfig.failover_configurations.identifier);
                
                let describeActiveProxyParams = {
                    DBProxyName: rdsConfig.failover_configurations.proxy_name,
                    DBInstanceIdentifier: rdsConfig.failover_configurations.identifier
                };

                custom_logging(`Getting ${rdsConfig.failover_configurations.proxy_name} details in ${environmentConfig.failover_region}`);
                let result = await describeDBProxies(failoverRdsClient, describeActiveProxyParams);

                let updateActiveProxyParams = {
                    DBProxyName: rdsConfig.failover_configurations.proxy_name,
                    Auth: result.Auth,
                    IdleClientTimeout: result.IdleClientTimeout,
                    DebugLogging: result.DebugLogging,
                    RequireTLS: result.RequireTLS,
                    RoleArn: result.RoleArn
                };

                custom_logging(`Updating ${rdsConfig.failover_configurations.proxy_name} details in ${environmentConfig.failover_region}`);
                await updateRDSProxy(failoverRdsClient, updateActiveProxyParams);
                
                custom_logging(`Registering ${rdsConfig.failover_configurations.identifier} with proxy ${rdsConfig.failover_configurations.proxy_name} in ${environmentConfig.failover_region}`);
                await updateProxyTargets(failoverRdsClient, rdsConfig.failover_configurations.proxy_name, rdsConfig.failover_configurations.identifier);

                if (global.PROCESS_CURRENT_ENVIRONMENT) {
                    let renamedActiveInstanceId = await modifyDBInstanceIdentifier(activeRdsClient, rdsConfig.active_configurations);
                    
                    custom_logging(chalk.green(`Successfully renamed to ${renamedActiveInstanceId}`));
                    let oldDbInstanceDetails = await describeDBInstances(activeRdsClient, renamedActiveInstanceId);
                    const oldDbInstance = oldDbInstanceDetails.DBInstances[0];
                    
                    const { Account: accountId } = await sts.getCallerIdentity({}).promise();
                    
                    let createFailoverReadReplicaParams = {
                        DBInstanceIdentifier: rdsConfig.active_configurations.identifier,
                        SourceDBInstanceIdentifier: `arn:aws:rds:${environmentConfig.failover_region}:${accountId}:db:${rdsConfig.failover_configurations.identifier}`,
                        SourceRegion: environmentConfig.failover_region,
                        DBInstanceClass: oldDbInstance.DBInstanceClass,
                        DBSubnetGroupName: rdsConfig.active_configurations.subnet_group_name,
                        VpcSecurityGroupIds: rdsConfig.active_configurations.security_group_ids,
                        OptionGroupName: oldDbInstance.OptionGroupMemberships[0].OptionGroupName
                    };
                    
                    if (rdsConfig.active_configurations.hasOwnProperty("kms_key_id") && rdsConfig.active_configurations.kms_key_id != "")
                        createFailoverReadReplicaParams['KmsKeyId'] = rdsConfig.active_configurations.kms_key_id;
                    
                    custom_logging(chalk.green(`Creating read-replica of ${rdsConfig.failover_configurations.identifier} in ${environmentConfig.active_region}`));
                    await createReadReplica(activeRdsClient, createFailoverReadReplicaParams);
                    custom_logging(chalk.green(`Successfully created read-replica of ${rdsConfig.failover_configurations.identifier} in ${environmentConfig.active_region}`));
                }
                
                custom_logging(chalk.yellow(`${rdsConfig.failover_configurations.identifier} is now the primary in ${environmentConfig.failover_region}`));
                if (global.PROCESS_CURRENT_ENVIRONMENT) {
                    custom_logging(chalk.yellow(`${rdsConfig.failover_configurations.identifier} is now a read replica in ${environmentConfig.active_region}`));
                }
            }
        }
    }
    catch (error) {
        custom_logging(chalk.red("Error: ") + error.message);
    }
};

const processFiles = async (file, options) => {
    if (!fs.existsSync(file)) {
        custom_logging(chalk.red(`Configuration file not found: ${file}, skipping...`));
        return;
    }
    let fileConfig = await readAndParseFile(file);
    let configuration = { "rds": {} }
    configuration.active_region = fileConfig.active_region
    configuration.failover_region = fileConfig.failover_region
    configuration.switching_to = process.env.SWITCHING_TO
    configuration['CLIENT_NAME'] = process.env.CLIENT_NAME
    configuration['rds'] = [...fileConfig.rds]
    configuration.rds = fileConfig.rds.map(rdsConfig => ({
        ...rdsConfig,
        force_delete: process.env.FORCE_DELETE === 'true'
    }));
    custom_logging(`Switching to ${chalk.green(configuration.switching_to)} environment`)
    await processRds(configuration)
};

const mainFunction = async () => {
    program
        .version('0.0.1')
        .option('-dr --dryRun', "Dry run the process")
        .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")

        .parse(process.argv);
    
    global.SLEEP_TIME = 1000;
    const options = program.opts();
    if (options.dryRun) {
        global.DRY_RUN = true;
        custom_logging(chalk.yellow("DRY RUN is enabled"))
    }
    else
        custom_logging(chalk.red("DRY RUN is disabled"))

    if (options.processCurrentEnvironment) {
        global.PROCESS_CURRENT_ENVIRONMENT = true;
        custom_logging(chalk.red("Current environment will be processed"))
    }
    else
        custom_logging(chalk.yellow("Current environment will not be processed"))

    let clientFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'rds', 'configuration.json');
    await processFiles(clientFile, options);
    custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
    .then(() => {
        custom_logging(chalk.green("Exiting ..."));
    })
    .catch((error) => {
        custom_logging(chalk.red("Error: ") + error.message);
    });