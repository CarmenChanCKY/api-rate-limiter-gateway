import http from "k6/http";

// load test within a period
// try to increase load

// 10 virtual machine
// run for 30 seconds
export const options = {
  vus: 10,
  duration: "30s",
};

export default function () {
  // Make a GET request
  http.get("http://gateway:3000/get-api");
}
