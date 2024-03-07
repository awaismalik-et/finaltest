const modifyLambdaConcurrency = async (lambda, environmentConfig, concurrency) =>{
    const targetArns = environmentConfig;
    for (const arn of targetArns) {
        const lambdaArnParams = {
            FunctionName: arn,
            ReservedConcurrentExecutions: concurrency
        };
        await lambda.putFunctionConcurrency(lambdaArnParams).promise();
        console.log(`Updated concurrency for ${arn} to ${concurrency}`);
    }
}

const getLambdaArns = async (lambda, items) => {
    let aggregateLambdaArns = [];
    for (let item of items) {
        const lambdaArns = await listLambdas(lambda, item);
        aggregateLambdaArns = aggregateLambdaArns.concat(lambdaArns);
    }
    return aggregateLambdaArns;
};

const listLambdas = async (lambda, prefix = "") => {
    let functionsWithPrefix = [];
    let nextMarker = null;
    do {
        const listParams = {
            Marker: nextMarker
        };
        const data = await lambda.listFunctions(listParams).promise();
        const functionsFiltered = data.Functions.filter(func => func.FunctionName.startsWith(prefix)).map(func => func.FunctionArn);
        functionsWithPrefix.push(...functionsFiltered);
        nextMarker = data.NextMarker;
    } while (nextMarker);
    return functionsWithPrefix
};
const listAndModifyFunctions = async (lambda, prefix = "", concurrency = 0) => {
    try {
        let functionsWithPrefix = [];
        let nextMarker = null;
        do {
            const listParams = {
                MaxItems: 100,
                Marker: nextMarker
            };
            const data = await lambda.listFunctions(listParams).promise();
            const functionsFiltered = data.Functions.filter(func => func.FunctionName.startsWith(prefix));
            functionsWithPrefix.push(...functionsFiltered);
            nextMarker = data.NextMarker;
            for (const func of functionsFiltered) {
                const updateParams = {
                    FunctionName: func.FunctionName,
                    ReservedConcurrentExecutions: concurrency
                };
                await lambda.putFunctionConcurrency(updateParams).promise();
                console.log(`Updated concurrency for ${func.FunctionName}`);
            }
        } while (nextMarker);
        functionsWithPrefix.forEach(func => {
            console.log(func.FunctionName);
        });
    } catch (err) {
        console.log("Error:", err);
    }
};


module.exports = {
    listLambdas,
    modifyLambdaConcurrency,
    getLambdaArns,
    listAndModifyFunctions
}
