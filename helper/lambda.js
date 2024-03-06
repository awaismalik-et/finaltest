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

module.exports = listAndModifyFunctions
