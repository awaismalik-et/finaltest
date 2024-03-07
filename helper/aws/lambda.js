const modifyLambdaConcurrency = async (lambda, environmentConfig, concurrency) =>{
    const targetArns = environmentConfig;
    for (const arn of targetArns) {
        const lambdaArnParams = {
            FunctionName: arn,
            ReservedConcurrentExecutions: concurrency
        };
        // await lambda.putFunctionConcurrency(lambdaArnParams).promise();
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

module.exports = {
    listLambdas,
    modifyLambdaConcurrency,
    getLambdaArns
}
