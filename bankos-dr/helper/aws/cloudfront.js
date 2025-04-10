const { custom_logging }  = require ("../helper.js")

const updateDistribution = async(cloudfront, distributionId, distributionConfig, eTag) => {
    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
    if (!global.DRY_RUN)
        await cloudfront.updateDistribution({
            Id: distributionId,
            DistributionConfig: distributionConfig,
            IfMatch: eTag
        }).promise();
    custom_logging(`Updating cloudfront ${distributionId}`);
}


const createInvalidation = async(cloudfront, distributionId ) => {
    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
    if (!global.DRY_RUN)
        await cloudfront.createInvalidation({
            DistributionId: distributionId,
            InvalidationBatch: {
                CallerReference: `${Date.now()}`,
                Paths: {
                Quantity: 1,
                Items: ['/*'] // Invalidate all objects in the distribution
                }
            }
        }).promise();
    custom_logging(`Clearing cloudfront cache ${distributionId}`);
}
module.exports = {createInvalidation, updateDistribution}
