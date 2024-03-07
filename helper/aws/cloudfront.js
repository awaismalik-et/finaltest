const updateDistribution = async(cloudfront, distributionId, distributionConfig, eTag ) =>{
    await cloudfront.updateDistribution({
        Id: distributionId,
        DistributionConfig: distributionConfig,
        IfMatch: eTag
    }).promise();
    
}


const createInvalidation = async(cloudfront, distributionId ) =>{
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
    
}
module.exports = {createInvalidation, updateDistribution}


