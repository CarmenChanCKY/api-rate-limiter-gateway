import http from "k6/http";
import { sleep } from "k6";

// basic load test
// test whether k6 works

// 5 iterations
// 1 virtual machine
// there are only 1 http request inside function
// it means 1 virtual maching finish total 1 x 5 iterations
export const options = {
  iterations: 5,
};

export default function () {
  // Make a GET request
  http.get("http://gateway:3000/get-api");

  // Sleep for 1 second to simulate real-world usage
  sleep(1);
}
