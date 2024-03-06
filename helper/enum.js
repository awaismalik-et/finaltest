const lambdaType = Object.freeze({
    PREFIX: 'prefix',
    ALL: 'all',
    ARN: 'arn'
  });

  const lambdaEnvironment = Object.freeze({
    ACTIVE_ENV: 'ACTIVE',
    FAILOVER_ENV: 'FAILOVER'
  });  

module.exports = {lambdaType, lambdaEnvironment}
  