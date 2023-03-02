## Zingo PC

## Compiling from source
Zingo PC is written in Electron/Javascript and can be build from source. It will also automatically compile the Rust SDK needed to run zingo-pc.

#### Pre-Requisites
You need to have the following software installed before you can build Zingo PC Fullnode

* [Nodejs v12.16.1 or higher](https://nodejs.org)
* [Yarn](https://yarnpkg.com)
* [Rust v1.40 or higher](https://www.rust-lang.org/tools/install)

```
git clone https://github.com/zingolabs/zingo-pc.git
cd zingo-pc

yarn install
yarn build
```

If for some reason you get an `ERR_OSSL_EVP_UNSUPPORTED` error when running `yarn build`, just run the command with `NODE_OPTIONS=--openssl-legacy-provider` env variable, or downgrade the `node` version.

To start in locally, run
```
yarn start
```

If for some reason, you couldn't run zingo-pc using the above command, so I compiled the binary instead:
```
yarn dist:linux
or
yarn dist:win
or
yarn dist:mac
```

The binaries should be in the *dist* directory.
