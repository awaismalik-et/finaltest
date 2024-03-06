const lambdaType = Object.freeze({
    PREFIX: 'prefix',
    ALL: 'all',
    ARN: 'arn'
  });

  const lambdaEnvironment = Object.freeze({
    ACTIVE_ENV: 'PROD',
    FAILOVER_ENV: 'DR'
  });  

module.exports = {lambdaType, lambdaEnvironment}
  