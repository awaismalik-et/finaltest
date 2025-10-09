# Jenkins Shared Library — `clientConfig.groovy`

**Purpose**  
This shared library provides a **single, centralized source of truth** for all client names used across Jenkins pipelines.  

Instead of duplicating client lists in every pipeline, we define them once in `clientConfig.groovy` and pull them into pipelines at runtime. This ensures:  
- **Consistency** → all pipelines use the same list of clients.  
- **Maintainability** → adding/removing clients requires one change only.  
- **Simplicity** → Jenkins parameters remain static, while client expansion is handled dynamically.  

---

## Client List API

```groovy
// vars/clientConfig.groovy
def getAllClients() {
    return ['ach', 'fedwire', 'fednow', 'rtp', 'sample-client', 'udr']
}
```

---

## Configure in Jenkins (one-time setup)

1. **Manage Jenkins → Configure System → Global Pipeline Libraries → Add**
2. **Name:** `client-shared-config`
3. **Default version:** branch containing `vars/` (e.g., `main` or `shared-library`)
4. **Retrieval method:** Modern SCM → GitHub/Git
5. **Repository URL:** this repository (add credentials if private)
6. **Save**

> Jenkins exposes files in `vars/` as global variables by filename.  
> For example: `clientConfig.groovy` → available as `clientConfig` in pipelines.

---

## Example Usage in Pipelines

At the top of your Jenkinsfile, load the shared library:

```groovy
@Library('client-shared-config') _
```

The pipeline then:  
- Defines parameters such as:  
  - **SWITCHING_TO** → `ACTIVE` or `FAILOVER`  
  - **CLIENT_NAME** → values pulled dynamically from `clientConfig.getAllClients()`  
  - AWS credentials (secure inputs)  
  - Boolean flags → `DRY_RUN`, `PROCESS_CURRENT_ENV`, `PROCESS_COMMON_CONFIG`  
- At runtime:  
  - **All** → expands to the full client list (minus `All` and `None`).  
  - **None** → skips unless `PROCESS_COMMON_CONFIG` is selected.  
  - **Specific client** → runs only for that client.  
  - **PROCESS_COMMON_CONFIG** → adds `common` alongside client(s).  
- Each client is processed by calling the Node.js execution script (e.g. `services/ec2/main.js`) with the appropriate parameters.

**In short:**  
The shared library centralizes the client list, and the pipeline decides which clients to run against, passing them to the execution logic.

---

## Maintenance

- Update the list in `getAllClients()` (`vars/clientConfig.groovy`) to add or remove clients.  
- Pipelines automatically pick up the updated list on the next run.  
