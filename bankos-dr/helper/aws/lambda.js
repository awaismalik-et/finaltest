const { custom_logging }  = require ('../helper.js')
const chalk = require('chalk');

const modifyLambdaConcurrency = async (lambdaClient, environmentConfig, concurrency) =>{
    const targetArns = environmentConfig;
        
    for (const arn of targetArns) {
        let currentConcurrency = null;
        const lambdaArnParams = {
            FunctionName: arn,
            ReservedConcurrentExecutions: concurrency
        };
        await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
        currentConcurrency = await getFunctionConcurrency(lambdaClient, arn);
        
        if (currentConcurrency != null && !global.DRY_RUN)
            await lambdaClient.putFunctionConcurrency(lambdaArnParams).promise();    
        
        if (currentConcurrency == null)
            custom_logging(`Concurrency is not set already for ${arn}, so skipping`);
        else
            custom_logging(`Updated concurrency for ${arn} to ${concurrency}`);
    }
}

const getFunctionConcurrency = async(lambdaClient, arn) => {
    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
    concurrency = null;
    try {
        response = await lambdaClient.getFunctionConcurrency({ FunctionName: arn}).promise();
        concurrency = response.ReservedConcurrentExecutions;
    }
    catch (error) {
        custom_logging(chalk.red("Error: ") + error.message)
    }
    return concurrency;
};

const listLambdas = async (lambdaClient, prefix = "") => {
    let functionsWithPrefix = [];
    let nextMarker = null;
    do {
        const listParams = {
            Marker: nextMarker
        };
        const data = await lambdaClient.listFunctions(listParams).promise();
        const functionsFiltered = data.Functions.filter(func => func.FunctionName.startsWith(prefix)).map(func => func.FunctionArn);
        functionsWithPrefix.push(...functionsFiltered);
        nextMarker = data.NextMarker;
    } while (nextMarker);
    return functionsWithPrefix
};

const addLambdaPermission = async(lambdaClient, name, principal, sourceArn) => {
    console.log("sourceArn")
    console.log(sourceArn)
    // try {
        const uniqueId = Date.now(); // Generates a unique timestamp
        const statementId = `atm-${name.replace("-", "").slice(-3)}-${sourceArn.replace("-", "").slice(-3)}-${uniqueId}`;
        
        await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
        if (!global.DRY_RUN)
            await lambdaClient.addPermission({
                FunctionName: name,                
                StatementId: statementId,
                Action: "lambda:InvokeFunction",
                Principal: principal,
                SourceArn: sourceArn
            }).promise()
    }
    // catch (error) {
    //     custom_logging(chalk.yellow("Error here: ") + error.message)
    //     // 
    //     // custom_logging(chalk.yellow("Error: ") + error.message)
    // }
// }

const getEventSourceMapping = async(lambdaClient, uuid) => {
    try {
        await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
        return await lambdaClient.getEventSourceMapping({
            UUID: uuid
        }).promise();
    }
    catch (error) { }
}

const updateEventSourceMapping = async(lambdaClient, config) => {
    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
    if (!global.DRY_RUN)
        await lambdaClient.updateEventSourceMapping(config).promise();
}

module.exports = {
    listLambdas,
    modifyLambdaConcurrency,
    getFunctionConcurrency,
    addLambdaPermission,
    getEventSourceMapping,
    updateEventSourceMapping
}
