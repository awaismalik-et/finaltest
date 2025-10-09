# AWS Transfer Family Replication
## Overview
This script (transfer-replication.js) is designed to automate the replication of AWS Transfer Family users between Active and Failover environments. It ensures that during a failover event or environment restoration, all users with their appropriate configurations are replicated between the Active and Failover Transfer Family servers.
The script also supports a dry-run mode for safe testing and a flag to decide whether to process the current environment, both of which are dynamically controlled via the Jenkins pipeline (Jenkinsfile).

## How It Works
### Configuration Check
Before execution, the script performs the following checks:

Verifies that the configuration file exists for the specified client
Validates the AWS credentials and connectivity
Determines the direction of switching (Active to Failover or Failover to Active)

### Multi-Client Handling
This script supports processing multiple clients dynamically based on the CLIENT_NAME parameter passed through the Jenkins pipeline.

#### How It Works
The CLIENT_NAME parameter can be set to:

A specific client name (e.g., FED, RTP, etc.)
All — which triggers the script to run for all configured clients.

Additionally, enabling PROCESS_COMMON_CONFIG will add the common configuration to the client list for processing.
#### Example Behaviors
| CLIENT_NAME | PROCESS_COMMON_CONFIG | Clients Processed                                      |
|-------------|------------------------|--------------------------------------------------------|
| `FED`       | `false`                | `FED`                                                  |
| `All`       | `false`                | `FED`, `RTP`, `FED-ACH`, `sample-client`              |
| `All`       | `true`                 | `FED`, `RTP`, `FED-ACH`, `sample-client`, `common`    |
| `RTP`       | `true`                 | `RTP`, `common`                                        |

For each client in the list:

The script will be executed separately.
Transfer Family user configurations will be replicated as needed.

### User Replication Logic
#### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads the configuration file to obtain:

Active region Transfer Family server ID and S3 bucket
Failover region Transfer Family server ID and S3 bucket
IAM Role ARNs for each environment

##### Actions performed:

Retrieve all users from the Active Transfer Family server
For each user, create a corresponding user on the Failover server with:

- Same username and SSH keys
- Updated HomeDirectory to point to the Failover S3 bucket
- Updated IAM Role from the configuration
- HomeDirectoryType preserved (PATH or LOGICAL)
- For LOGICAL HomeDirectoryType users, HomeDirectoryMappings updated to point to the Failover S3 bucket

This ensures that:

- All users from the Active environment are replicated to the Failover environment
- User access permissions and restrictions are maintained
- S3 bucket references are updated to point to the correct Failover resources

#### Switching from Failover to Active Region
When switching from Failover to Active, the following steps occur:

The script reads the configuration file to obtain:

Active region Transfer Family server ID and S3 bucket
Failover region Transfer Family server ID and S3 bucket
IAM Role ARNs for each environment


##### Actions performed:

Retrieve all users from the Failover Transfer Family server
For each user, create a corresponding user on the Active server with:

- Same username and SSH keys
- Updated HomeDirectory to point to the Active S3 bucket
- Updated IAM Role from the configuration
- HomeDirectoryType preserved (PATH or LOGICAL)
- For LOGICAL HomeDirectoryType users, HomeDirectoryMappings updated to point to the Active S3 bucket

This ensures that:

- All users from the Failover environment are replicated to the Active environment
- User access permissions and restrictions are maintained
- S3 bucket references are updated to point to the correct Active resources

### Transfer Family Server Swap Logic

#### Switching Between Active and Failover Regions
When switching, the following steps occur:

The script reads the configuration file to obtain:

- Active and Failover Transfer Family server IDs  

##### Actions Performed:
- Retrieves details (tags, endpoints, IPs) for both servers  
- Updates **Route 53 records** to point the Active hostname to the Failover endpoint or vice versa  
- Swaps the `transfer:customHostname` and `transfer:route53HostedZoneId` tags between both servers  
- Updates the `SWITCHING_TO` tag to reflect the target environment  
- Supports **dry-run mode** — logs all intended actions without applying any changes  

This ensures that:

- Hostnames and DNS entries accurately reflect the target environment  
- Failover and Active states remain synchronized for seamless transitions  
- Metadata and tags stay consistent for future operations

### Dry Run Mode
When enabled, all planned actions are logged but no real changes are applied to AWS Transfer Family servers — useful for testing and validation. In dry run mode:

The script will list all users it would replicate
Display the modifications it would make to HomeDirectory and IAM Role values
No actual changes are made to AWS resources

## Important Notes

- The script handles both standard users (HomeDirectoryType: PATH) and restricted users (HomeDirectoryType: LOGICAL)
- For LOGICAL type users, HomeDirectoryMappings are updated to point to the correct S3 bucket
- Existing users on the target server are skipped to avoid overwriting any custom configurations
- SSH keys are preserved and transferred to the replicated users