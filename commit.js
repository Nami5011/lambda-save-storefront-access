
export default function commit (connection) {
  return new Promise((resolve, reject) => {
    connection.commit((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(err);
      }
    });
  });
}
