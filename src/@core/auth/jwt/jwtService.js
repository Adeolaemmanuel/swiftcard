import axios from "axios";
import jwtDefaultConfig from "./jwtDefaultConfig";

export default class JwtService {
  // ** jwtConfig <= Will be used by this service
  jwtConfig = { ...jwtDefaultConfig };

  // ** For Refreshing Token
  isAlreadyFetchingAccessToken = false;

  // ** For Refreshing Token
  subscribers = [];

  constructor(jwtOverrideConfig) {
    this.jwtConfig = { ...this.jwtConfig, ...jwtOverrideConfig };

    // ** Request Interceptor
    axios.interceptors.request.use(
      (config) => {
        // ** Get token from localStorage
        const accessToken = this.getToken();
        // config.baseURL = `${process.env.REACT_APP_API}`;
        config.headers["access-control-allow-headers"] = "*";
        config.headers["access-control-allow-methods"] = "*";
        config.headers["access-control-allow-origin"] = "*";
        config.headers.Accept = "*/*";

        // ** If token is present add it to request's Authorization Header
        if (accessToken) {
          // ** eslint-disable-next-line no-param-reassign
          config.headers.Authorization = `${this.jwtConfig.tokenType} ${accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // ** Add request/response interceptor
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // ** const { config, response: { status } } = error
        const { config, response } = error;
        const originalRequest = config;

        // ** if (status === 401) {
        if (response && response.status === 401) {
          if (!this.isAlreadyFetchingAccessToken) {
            this.isAlreadyFetchingAccessToken = true;
            this.refreshToken().then((r) => {
              this.isAlreadyFetchingAccessToken = false;

              // ** Update accessToken in localStorage
              this.setToken(r.data.accessToken);
              this.setRefreshToken(r.data.refreshToken);

              this.onAccessTokenFetched(r.data.accessToken);
            });
          }
          const retryOriginalRequest = new Promise((resolve) => {
            this.addSubscriber((accessToken) => {
              // ** Make sure to assign accessToken according to your response.
              // ** Check: https://pixinvent.ticksy.com/ticket/2413870
              // ** Change Authorization header
              originalRequest.headers.Authorization = `${this.jwtConfig.tokenType} ${accessToken}`;
              resolve(this.axios(originalRequest));
            });
          });
          return retryOriginalRequest;
        }
        return Promise.reject(error);
      }
    );
  }

  onAccessTokenFetched(accessToken) {
    this.subscribers = this.subscribers.filter((callback) =>
      callback(accessToken)
    );
  }

  addSubscriber(callback) {
    this.subscribers.push(callback);
  }

  getToken() {
    return localStorage.getItem(this.jwtConfig.storageTokenKeyName);
  }

  getRefreshToken() {
    return localStorage.getItem(this.jwtConfig.storageRefreshTokenKeyName);
  }

  setToken(value) {
    localStorage.setItem(this.jwtConfig.storageTokenKeyName, value);
  }

  setRefreshToken(value) {
    localStorage.setItem(this.jwtConfig.storageRefreshTokenKeyName, value);
  }

  login(args) {
    let username = args.email;
    let password = args.password;
    let auth = `${btoa(`${username}:${password}`)}`;
    this.setToken(auth);
    return axios.get(this.jwtConfig.loginEndpoint, {
      baseURL: process.env.REACT_APP_API,
      headers: {
        Authorization: this.getToken(),
      },
    });
  }

  register(args) {
    return axios.post(this.jwtConfig.registerEndpoint, args, {
      baseURL: this.fetchDueToCors(),
    });
  }

  refreshToken() {
    return axios.post(this.jwtConfig.refreshEndpoint, {
      refreshToken: this.getRefreshToken(),
    });
  }

  fetchDueToCors() {
    return `${
      process.env.REACT_APP_ENV === "dev"
        ? `https://thingproxy.freeboard.io/fetch/${process.env.REACT_APP_API}`
        : `${process.env.REACT_APP_API}`
    }`;
  }

  getUserData() {
    const data = localStorage.getItem("userData");
    return JSON.parse(data);
  }
}
