
export default function query (connection, statement, params=null) {
  return new Promise((resolve, reject) => {
      if (params) {
        connection.query(statement, params, (err, results, fields) => {
          if (err) {
            reject(err);
          } else {
            resolve(results, fields);
          }
        });
      } else {
        connection.query(statement,  (err, results, fields) => {
          if (err) {
            reject(err);
          } else {
            resolve(results, fields);
          }
        });
      }

  });
}
