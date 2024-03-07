const searchType = Object.freeze({
    PREFIX: 'prefix',
    ALL: 'all',
    ARN: 'arn'
  });

  const searchEnvironment = Object.freeze({
    ACTIVE_ENV: 'ACTIVE',
    FAILOVER_ENV: 'FAILOVER'
  });  

module.exports = {searchType, searchEnvironment}
  