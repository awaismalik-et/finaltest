const modifyLambdaConcurrency = async (lambda, environmentConfig, concurrency) =>{
    const targetArns = environmentConfig;
    for (const arn of targetArns) {
        const lambdaArnParams = {
            FunctionName: arn,
            ReservedConcurrentExecutions: concurrency
        };
        await lambda.putFunctionConcurrency(lambdaArnParams).promise();
        console.log(`Updated concurrency for ${arn}`);
    }
}

const listLambdas = async (lambda, prefix = "") => {
    try {
        let functionsWithPrefix = [];
        let nextMarker = null;
        do {
            const listParams = {
                MaxItems: 100,
                Marker: nextMarker
            };
            const data = await lambda.listFunctions(listParams).promise();
            const functionsFiltered = data.Functions.filter(func => func.FunctionName.startsWith(prefix)).map(func => func.FunctionArn);
            functionsWithPrefix.push(...functionsFiltered);
            nextMarker = data.NextMarker;
        } while (nextMarker);
        return functionsWithPrefix
    } catch (err) {
        console.log("Error:", err);
    }
};

module.exports = {
    listLambdas,
    modifyLambdaConcurrency
}
