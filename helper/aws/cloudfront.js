const updateDistribution = async(cloudfront, distributionId, distributionConfig, eTag ) =>{
    // await cloudfront.updateDistribution({
    //     Id: distributionId,
    //     DistributionConfig: distributionConfig,
    //     IfMatch: eTag
    // }).promise();
    console.log(`Updating cloudfront ${distributionId}`);
}


const createInvalidation = async(cloudfront, distributionId ) =>{
    // await cloudfront.createInvalidation({
    //     DistributionId: distributionId,
    //     InvalidationBatch: {
    //         CallerReference: `${Date.now()}`,
    //         Paths: {
    //           Quantity: 1,
    //           Items: ['/*'] // Invalidate all objects in the distribution
    //         }
    //       }
    // }).promise();
    console.log(`Clearing cloudfront cache ${distributionId}`);
}
module.exports = {createInvalidation, updateDistribution}