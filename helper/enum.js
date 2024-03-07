const searchType = Object.freeze({
    PREFIX: 'prefix',
    ALL: 'all',
    ARN: 'arn'
  });

  const awsEnvironment = Object.freeze({
    ACTIVE_ENV: 'ACTIVE',
    FAILOVER_ENV: 'FAILOVER'
  });  

module.exports = {searchType, awsEnvironment}
  