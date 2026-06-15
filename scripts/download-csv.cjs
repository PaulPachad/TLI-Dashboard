const https = require('https');
https.get('https://docs.google.com/spreadsheets/d/1miLrYezf22XzCdDC5Q45JxBnSuYGeEdcG0UOf81zqXg/export?format=csv&gid=0', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data.split('\n').slice(0, 5).join('\n'));
  });
});
