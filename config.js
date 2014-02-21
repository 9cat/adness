module.exports = {
  port: process.env.PORT || 8080,
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1', 
    port: process.env.REDIS_PORT || 6379
  },
  elasticsearch: {
    url: 'http://127.0.0.1:9200/tng',
    pageSize: 20
  },
  secret: 'secret string for adness 1234!',
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    username: process.env.MYSQL_USERNAME || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: process.env.MYSQL_DATABASE || 'smf'
  },
  couchdb: {
    url: 'http://localhost:5984'
  }
};