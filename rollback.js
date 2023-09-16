
export default function rollback (connection, err) {
  return new Promise((resolve, reject) => {
    connection.rollback(() => {
      reject(err);
    });
  });
}
