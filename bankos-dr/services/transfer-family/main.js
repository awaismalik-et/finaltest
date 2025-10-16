const { custom_logging } = require('../../helper/helper.js');
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const path = require('path');
const readFileAsync = promisify(fs.readFile);

const AWS = require('aws-sdk');
const route53 = new AWS.Route53();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5, // Maximum number of retries
  retryDelayOptions: { 
    base: 200 // Base delay in milliseconds
  }
});

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  const dataToJson = JSON.parse(data);
  return dataToJson;
};

const getTransferUsers = async (transferClient, serverId) => {
    custom_logging(chalk.blue(`Getting users from Transfer Family server: ${serverId}`));
    
    try {
      const users = [];
      let nextToken = null;
      
      do {
        const params = {
          ServerId: serverId,
          MaxResults: 100
        };
        
        if (nextToken) {
          params.NextToken = nextToken;
        }
        
        const response = await transferClient.listUsers(params).promise();
        
        const usersList = response.Users || [];
        
        for (const userSummary of usersList) {
          const userDetail = await transferClient.describeUser({
            ServerId: serverId,
            UserName: userSummary.UserName
          }).promise();
          users.push(userDetail.User);
        }
        
        nextToken = response.NextToken;
      } while (nextToken);
      
      custom_logging(chalk.green(`Successfully fetched ${users.length} users from server ${serverId}`));
      return users;
    } catch (error) {
      custom_logging(chalk.red(`Error getting users from Transfer Family server ${serverId}: ${error.message}`));
      throw error;
    }
};

const createTransferUser = async (transferClient, serverId, userData, targetBucket, targetRole) => {
    try {
      const params = {
        ServerId: serverId,
        Role: targetRole,
        UserName: userData.UserName,
        HomeDirectoryType: userData.HomeDirectoryType
      };
      
      if (userData.HomeDirectoryType === 'PATH') {
        params.HomeDirectory = `/${targetBucket}/${userData.UserName}`;
      } else if (userData.HomeDirectoryType === 'LOGICAL') {
        if (userData.HomeDirectoryMappings && userData.HomeDirectoryMappings.length > 0) {
          params.HomeDirectoryMappings = userData.HomeDirectoryMappings.map(mapping => {
            const updatedTarget = mapping.Target.replace(/\/[^\/]+\//, `/${targetBucket}/`);
            return {
              Entry: mapping.Entry,
              Target: updatedTarget
            };
          });
        }
      }
      
      if (userData.Policy) {
        params.Policy = userData.Policy;
      }
      
      if (userData.PosixProfile) {
        params.PosixProfile = userData.PosixProfile;
      }
      
      custom_logging(chalk.cyan(`Creating user with modified parameters:`));
      custom_logging(JSON.stringify(params, null, 2));
      
      await transferClient.createUser(params).promise();
      custom_logging(chalk.green(`Created user ${userData.UserName} on server ${serverId} with bucket ${targetBucket} and role ${targetRole}`));
      
      if (userData.SshPublicKeys && userData.SshPublicKeys.length > 0) {
        for (const sshKey of userData.SshPublicKeys) {
          const keyBody = sshKey.SshPublicKeyBody;
          
          await transferClient.importSshPublicKey({
            ServerId: serverId,
            UserName: userData.UserName,
            SshPublicKeyBody: keyBody
          }).promise();
          custom_logging(chalk.green(`Added SSH public key for user ${userData.UserName}`));
        }
      }
      
      return true;
    } catch (error) {
      custom_logging(chalk.red(`Error creating user ${userData.UserName} on server ${serverId}: ${error.message}`));
      throw error;
    }
};

const replicateTransferUsers = async (transferClient, serverId, users, targetBucket, targetRole) => {
  custom_logging(chalk.blue(`Replicating users to Transfer Family server: ${serverId} with bucket ${targetBucket} and role ${targetRole}`));
  
  try {
    const existingUsers = await getTransferUsers(transferClient, serverId);
    const existingUserNames = existingUsers.map(user => user.UserName);
    
    let created = 0;
    let skipped = 0;
    
    for (const user of users) {
      if (existingUserNames.includes(user.UserName)) {
        custom_logging(chalk.yellow(`User ${user.UserName} already exists on ${serverId}. Skipping.`));
        skipped++;
      } else {
        if (global.DRY_RUN) {
          custom_logging(chalk.yellow(`[DRY RUN] Would create user ${user.UserName} on ${serverId} with bucket ${targetBucket} and role ${targetRole}`));
        } else {
          await createTransferUser(transferClient, serverId, user, targetBucket, targetRole);
          created++;
        }
      }
    }
    
    custom_logging(chalk.green(`User replication complete for server ${serverId}. Created: ${created}, Skipped: ${skipped}`));
    return true;
  } catch (error) {
    custom_logging(chalk.red(`Error replicating users to Transfer Family server ${serverId}: ${error.message}`));
    throw error;
  }
};

const processTransferUserReplication = async (config) => {
  custom_logging(chalk.green("Starting Transfer Family user replication process"));
  
  const activeRegion = config.active_region;
  const failoverRegion = config.failover_region;
  
  const servers = config.servers;
  
  try {
    for (const serverPair of servers) {
      const activeServerConfig = serverPair.active_server;
      const failoverServerConfig = serverPair.failover_server;
      
      const activeTransfer = new AWS.Transfer({ region: activeRegion });
      const failoverTransfer = new AWS.Transfer({ region: failoverRegion });
      
      if (config.switching_to === "ACTIVE") {
        custom_logging(chalk.yellow("Replicating users from FAILOVER to ACTIVE server"));
        if (global.DRY_RUN) {
          custom_logging(chalk.yellow(`[DRY RUN] Would replicate users from ${failoverServerConfig.serverId} to ${activeServerConfig.serverId}`));
          custom_logging(chalk.yellow(`[DRY RUN] Would update bucket references to: ${activeServerConfig.bucket}`));
          custom_logging(chalk.yellow(`[DRY RUN] Would update Role to: ${activeServerConfig.iamRole}`));
        } else {
          const users = await getTransferUsers(failoverTransfer, failoverServerConfig.serverId);
          await replicateTransferUsers(
            activeTransfer, 
            activeServerConfig.serverId, 
            users, 
            activeServerConfig.bucket, 
            activeServerConfig.iamRole
          );
        }
      } else {
        custom_logging(chalk.yellow("Replicating users from ACTIVE to FAILOVER server"));
        if (global.DRY_RUN) {
          custom_logging(chalk.yellow(`[DRY RUN] Would replicate users from ${activeServerConfig.serverId} to ${failoverServerConfig.serverId}`));
          custom_logging(chalk.yellow(`[DRY RUN] Would update bucket references to: ${failoverServerConfig.bucket}`));
          custom_logging(chalk.yellow(`[DRY RUN] Would update Role to: ${failoverServerConfig.iamRole}`));
        } else {
          const users = await getTransferUsers(activeTransfer, activeServerConfig.serverId);
          await replicateTransferUsers(
            failoverTransfer, 
            failoverServerConfig.serverId, 
            users, 
            failoverServerConfig.bucket, 
            failoverServerConfig.iamRole
          );
        }
      }
    }
    
    custom_logging(chalk.green("Transfer Family user replication process completed"));
  } catch (error) {
    custom_logging(chalk.red('Error during user replication: ') + error.message);
    throw error;
  }
};

//This function updates the route53 records
async function updateRoute53Record(hostedZoneId, recordName, newTarget, isPrivate = false) {
  let recordType, resourceRecords;

  //if private we ue ips and type A
  if (isPrivate) {
    recordType = "A";
    resourceRecords = newTarget.map(ip => ({ Value: ip }));
  } else {
    //if public we use endpoint and type CNAME
    recordType = "CNAME";
    resourceRecords = [{ Value: newTarget }];
  }

  //params setting
  const params = {
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: recordName,
            Type: recordType,
            TTL: 60,
            ResourceRecords: resourceRecords,
          },
        },
      ],
    },
  };

  if (global.DRY_RUN) {
    custom_logging(chalk.yellow(`[DRY RUN] Would update Route53 ${recordType} record ${recordName} → ${isPrivate ? newTarget.join(", ") : newTarget}`));
    return;
  }
  //resource changing
  await route53.changeResourceRecordSets(params).promise();
  custom_logging(chalk.green(`Updated Route53 ${recordType} record ${recordName} → ${isPrivate ? newTarget.join(", ") : newTarget}`));
}

// Helper to fetch Transfer Family server details
async function getServerDetails(transferClient, serverId) {
  try {
    const { Server } = await transferClient.describeServer({ ServerId: serverId }).promise();
    const tagsResp = await transferClient.listTagsForResource({ Arn: Server.Arn }).promise();

    const hostnameTag = tagsResp.Tags.find(t => t.Key === "transfer:customHostname");
    const hostedZoneTag = tagsResp.Tags.find(t => t.Key === "transfer:route53HostedZoneId");
    const switchingTag = tagsResp.Tags.find(t => t.Key === "SWITCHING_TO");

    //errors for missing tags
    if (!hostnameTag) throw new Error(`Missing tag transfer:customHostname for ${serverId}`);
    if (!hostedZoneTag) throw new Error(`Missing tag transfer:route53HostedZoneId for ${serverId}`);

    let endpoint = null;
    let privateIps = [];

    if (Server.EndpointType === "VPC") {
      //for private endpoint
      const ec2 = new AWS.EC2({ region: transferClient.config.region });
      const vpcEndpointId = Server.EndpointDetails.VpcEndpointId;

      if (!vpcEndpointId) throw new Error(`No VPC endpoint ID for server ${serverId}`);

      const { VpcEndpoints } = await ec2.describeVpcEndpoints({ VpcEndpointIds: [vpcEndpointId] }).promise();
      if (!VpcEndpoints?.length) throw new Error(`VPC endpoint ${vpcEndpointId} not found`);

      const eniIds = VpcEndpoints[0].NetworkInterfaceIds;
      const { NetworkInterfaces } = await ec2.describeNetworkInterfaces({ NetworkInterfaceIds: eniIds }).promise();

      privateIps = NetworkInterfaces.flatMap(eni => eni.PrivateIpAddresses.map(ip => ip.PrivateIpAddress));
    } else {
      //for public endpoint
      endpoint = `${serverId}.server.transfer.${transferClient.config.region}.amazonaws.com`;
    }

    return {
      serverId,
      serverArn: Server.Arn,
      endpoint,
      privateIps,
      hostname: hostnameTag.Value,
      hostedZoneId: hostedZoneTag.Value.replace("/hostedzone/", ""),
      currentSwitchingTo: switchingTag ? switchingTag.Value : null,
      isPrivate: Server.EndpointType === "VPC"
    };
  } catch (error) {
    console.error(`Error fetching server details for ${serverId}: ${error.message}`);
  }
}

//Helper funtion for swtiching-to tag addition
async function updateServerTags(transferClient, serverArn, tags) {
  if (global.DRY_RUN) {
    custom_logging(chalk.yellow(`[DRY RUN] Would tag ${serverArn} with: ${JSON.stringify(tags)}`));
    return;
  }
  await transferClient.tagResource({ Arn: serverArn, Tags: tags }).promise();
  custom_logging(chalk.green(`Tagged ${serverArn} with ${tags.map(t => `${t.Key}=${t.Value}`).join(", ")}`));
}

const swapTransferFamilyHostnames = async (config) => {
  custom_logging(chalk.blue("Starting Transfer Family hostname swap process"));

  const activeRegion = config.active_region;
  const failoverRegion = config.failover_region;
  const servers = config.servers;

  try {
    for (const serverPair of servers) {
      const activeTransfer = new AWS.Transfer({ region: activeRegion });
      const failoverTransfer = new AWS.Transfer({ region: failoverRegion });

      const activeServer = await getServerDetails(activeTransfer, serverPair.active_server.serverId);
      const failoverServer = await getServerDetails(failoverTransfer, serverPair.failover_server.serverId);
      
      //IF we have same switching-to tag we don't need to switch
      if (activeServer.currentSwitchingTo === config.switching_to && failoverServer.currentSwitchingTo === config.switching_to) {
        custom_logging(chalk.yellow(`Already in '${config.switching_to}' state. No action needed.`));
        continue;
      }

      const updateServerHostnameViaTags = async (transferClient, serverArn, newHostname, hostedZoneId) => {
        const tagParams = {
          Arn: serverArn,
          Tags: [
            { Key: "transfer:customHostname", Value: newHostname },
            { Key: "transfer:route53HostedZoneId", Value: `/hostedzone/${hostedZoneId}` },
          ],
        };

        if (global.DRY_RUN) {
          custom_logging(chalk.yellow(`[DRY RUN] Would tag ${serverArn} with hostname ${newHostname} and hosted zone ${hostedZoneId}`));
          return;
        }

        await transferClient.tagResource(tagParams).promise();
        custom_logging(chalk.green(`Tagged ${serverArn} with hostname ${newHostname} and hosted zone ${hostedZoneId}`));
      };

      // Swapping
      if (config.switching_to === "ACTIVE") {
        custom_logging(chalk.yellow("Switching to ACTIVE environment"));

        await updateRoute53Record(
          failoverServer.hostedZoneId,
          failoverServer.hostname,
          activeServer.isPrivate ? activeServer.privateIps : activeServer.endpoint,
          activeServer.isPrivate
        );
        await updateRoute53Record(
          activeServer.hostedZoneId,
          activeServer.hostname,
          failoverServer.isPrivate ? failoverServer.privateIps : failoverServer.endpoint,
          failoverServer.isPrivate
        );

        await updateServerHostnameViaTags(failoverTransfer, failoverServer.serverArn, activeServer.hostname, activeServer.hostedZoneId);
        await updateServerHostnameViaTags(activeTransfer, activeServer.serverArn, failoverServer.hostname, failoverServer.hostedZoneId);

      } else {
        custom_logging(chalk.yellow("Switching to FAILOVER environment"));

        await updateRoute53Record(
          activeServer.hostedZoneId,
          activeServer.hostname,
          failoverServer.isPrivate ? failoverServer.privateIps : failoverServer.endpoint,
          failoverServer.isPrivate
        );
        await updateRoute53Record(
          failoverServer.hostedZoneId,
          failoverServer.hostname,
          activeServer.isPrivate ? activeServer.privateIps : activeServer.endpoint,
          activeServer.isPrivate
        );

        await updateServerHostnameViaTags(activeTransfer, activeServer.serverArn, failoverServer.hostname, failoverServer.hostedZoneId);
        await updateServerHostnameViaTags(failoverTransfer, failoverServer.serverArn, activeServer.hostname, activeServer.hostedZoneId);
      }

      // Update SWITCHING_TO tag at the end
      await updateServerTags(activeTransfer, activeServer.serverArn, [{ Key: "SWITCHING_TO", Value: config.switching_to }]);
      await updateServerTags(failoverTransfer, failoverServer.serverArn, [{ Key: "SWITCHING_TO", Value: config.switching_to }]);
    }

    custom_logging(chalk.green("Hostname swap and tagging completed successfully"));
  } catch (error) {
    custom_logging(chalk.red(`Error during hostname swap: ${error.message}`));
  }
};


const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('--transferfamily-index <index>', 'Index of transfer family resource to process')
    .parse(process.argv);

  const options = program.opts();

  global.SLEEP_TIME = 1000;
  
  const file = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'transfer-family', 'configuration.json');

  if (!fs.existsSync(file)) {
    custom_logging(chalk.red(`Configuration file not found for client: ${process.env.CLIENT_NAME}`));
    return;
  }

  let config = await readAndParseFile(file);
  config['switching_to'] = process.env.SWITCHING_TO;

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  if (options.transferfamilyIndex !== undefined) {
    custom_logging(chalk.green(`Processing transfer-family resource at index: ${options.transferfamilyIndex}`));
    const idx = parseInt(options.transferfamilyIndex);
    if (idx < 0 || idx >= config.servers.length) {
      custom_logging(chalk.red(`Index ${idx} out of bounds (0..${config.servers.length - 1})`));
      return;
    }
    config.servers = [  config.servers[idx] ];
  } else {
    custom_logging(chalk.yellow("Processing all transfer-family resources"));
  }
  
  custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);

  await processTransferUserReplication(config);
  custom_logging(chalk.green("User replication has been completed"));

  await swapTransferFamilyHostnames(config);
  custom_logging(chalk.green("Transferring Hostnames has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });