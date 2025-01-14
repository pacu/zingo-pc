import React, { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router";
import TextareaAutosize from "react-textarea-autosize";
import request from "request";
import progress from "progress-stream";
import native from "../../native.node";
import { RPCConfig, Info, Server } from "../appstate";
import RPC from "../../rpc/rpc";
import cstyles from "../common/Common.module.css";
import styles from "./LoadingScreen.module.css";
import { ContextApp } from "../../context/ContextAppState";
import serverUrisList from "../../utils/serverUrisList";
import { Logo } from "../logo";

const { ipcRenderer } = window.require("electron");
const fs = window.require("fs");

class LoadingScreenState {
  currentStatus: string | JSX.Element;

  currentStatusIsError: boolean;

  loadingDone: boolean;

  rpcConfig: RPCConfig | null;

  url: string;

  chain: '' | 'main' | 'test' | 'regtest';

  selection: '' | 'auto' | 'list' | 'custom';

  walletScreen: number; 
  // 0 -> no wallet, load existing wallet 
  // 1 -> show options
  // 2 -> create new 
  // 3 -> restore existing seed
  // 4 -> restore existing ufvk 

  newWalletError: null | string; // Any errors when creating/restoring wallet

  seed: string; // The new seed phrase for a newly created wallet or the seed phrase to restore from

  ufvk: string; // The UFVK to restore from

  birthday: number; // Wallet birthday if we're restoring

  changeAnotherWallet: boolean;

  serverUris: Server[];

  buttonsDisable: boolean;

  constructor(currentStatus: string | JSX.Element, 
              currentStatusIsError: boolean, 
              changeAnotherWallet: boolean, 
              serverUris: Server[]) {
    this.currentStatus = currentStatus;
    this.currentStatusIsError = currentStatusIsError;
    this.loadingDone = false;
    this.rpcConfig = null;
    this.url = "";
    this.chain = "";
    this.selection = '';
    this.walletScreen = 0;
    this.newWalletError = null;
    this.seed = "";
    this.ufvk = "";
    this.birthday = 0;
    this.changeAnotherWallet = changeAnotherWallet;
    this.serverUris = serverUris;
    this.buttonsDisable = false;
  }
}

type LoadingScreenProps = {
  setRPCConfig: (rpcConfig: RPCConfig) => void;
  setRescanning: (rescan: boolean, prevSyncId: number) => void;
  setInfo: (info: Info) => void;
  openServerSelectModal: () => void;
  setReadOnly: (readOnly: boolean) => void;
  setServerUris: (serverUris: Server[]) => void;
  navigateToDashboard: () => void;
};

class LoadingScreen extends Component<LoadingScreenProps & RouteComponentProps, LoadingScreenState> {
  static contextType = ContextApp;
  constructor(props: LoadingScreenProps & RouteComponentProps) {
    super(props);

    let currentStatus: string | JSX.Element = (
          <span>
            Checking servers to connect...
            <br />
            This process can take several seconds/minutes depends of the Server's status.
          </span>
        ),
        currentStatusIsError: boolean = false, 
        changeAnotherWallet: boolean = false,
        serverUris: Server[] = [];
    if (props.location.state) {
      const locationState = props.location.state as { 
        currentStatus: string, 
        currentStatusIsError: boolean, 
        serverUris: Server[],
      };
      currentStatus = locationState.currentStatus;
      currentStatusIsError = locationState.currentStatusIsError;
      if (locationState.currentStatus) {
        changeAnotherWallet = true;
      }
      serverUris = locationState.serverUris;
    }
    const state = new LoadingScreenState(currentStatus, currentStatusIsError, changeAnotherWallet, serverUris);
    this.state = state;
    this.props.setServerUris(serverUris);
  }

  componentDidMount = async () => {
    this.setState({
      buttonsDisable: true,
    })
    console.log('did mount, disable TRUE');

    const { rescanning, prevSyncId } = this.context;
    if (rescanning) {
      await this.runSyncStatusPoller(prevSyncId);
    } else {
      await this.doFirstTimeSetup();
    }

    this.setState({
      buttonsDisable: false,
    })
    console.log('did mount, disable FALSE');
  }

  download = (url: string, dest: string, name: string, cb: (msg: string) => void) => {
    const file = fs.createWriteStream(dest);
    const sendReq = request.get(url);

    // verify response code
    sendReq.on("response", (response) => {
      if (response.statusCode !== 200) {
        return cb(`Response status was ${response.statusCode}`);
      }

      const len = response.headers["content-length"] || "";
      const totalSize = (parseInt(len, 10) / 1024 / 1024).toFixed(0);

      const str = progress({ time: 1000 }, (pgrs) => {
        this.setState({
          currentStatus: `Downloading ${name}... (${(pgrs.transferred / 1024 / 1024).toFixed(0)} MB / ${totalSize} MB)`,
        });
      });

      sendReq.pipe(str).pipe(file);
    });

    // close() is async, call cb after close completes
    file.on("finish", () => file.close());

    // check for request errors
    sendReq.on("error", (err) => {
      fs.unlink(dest, () => {
        cb(err.message);
      });
    });

    file.on("error", (err: any) => {
      // Handle errors
      fs.unlink(dest, () => {
        cb(err.message);
      }); // Delete the file async. (But we don't check the result) 
    });
  };

  loadServer = async () => {    
    // Try to read the default server
    const settings = await ipcRenderer.invoke("loadSettings");
    console.log('SETTINGS;;;;;;;;;', settings);
    let server: string, 
        chain_name: 'main' | 'test' | 'regtest', 
        selection: 'auto' | 'list' | 'custom';
    if (!settings) {
      // no settings stored, asumming `list` by default.
      server = serverUrisList()[0].uri;
      chain_name = serverUrisList()[0].chain_name;
      selection = 'list';
      await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: server });
      await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
      await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
    } else {
      if (!settings.serveruri) {
        // no server in settings, asuming `list` by default.
        server = serverUrisList()[0].uri;
        chain_name = serverUrisList()[0].chain_name;
        selection = 'list';
        await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: server });
        await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
        await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
      } else {
        // the server is in settings, asking for the others fields.
        server = settings.serveruri;
        const serverInList = serverUrisList().filter((s: Server) => s.uri === server)
        if (!settings.serverchain_name) {
          chain_name = 'main';
          if (serverInList && serverInList.length === 1) {
            // if the server is in the list, then selection is `list`
            if (serverInList[0].obsolete) {
              // if obsolete then select the first one on list
              server = serverUrisList()[0].uri;
              chain_name = serverUrisList()[0].chain_name;
              selection = 'list';
              await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: server });
            } else {
              selection = 'list';
            }
          } else {
            selection = 'custom';
          }
          await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
          await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
        } else {
          chain_name = settings.serverchain_name;
          // the server & chain are in settings, asking for selection 
          if (!settings.serverselection) {
            if (serverInList && serverInList.length === 1) {
              // if the server is in the list, then selection is `list`
              chain_name = 'main';
              selection = 'list';
            } else {
              selection = 'custom';
            }
            await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
            await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
          } else {
            selection = settings.serverselection;
          }
        }
      }
    }
    // if the server selected is now obsolete, change it for the first one
    const serverInList = serverUrisList().filter((s: Server) => s.uri === server)
    if (serverInList[0].obsolete) {
      console.log('server obsolete', server, '=>', serverUrisList()[0].uri);
      server = serverUrisList()[0].uri;
      chain_name = serverUrisList()[0].chain_name;
      selection = 'list';
      await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: server });
      await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
      await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
    }

    // if empty is the first time and if auto => App needs to check the servers.
    let servers: Server[] = this.state.serverUris;

    if (selection === 'auto' && servers.length === 0) {
      servers = this.calculateServerLatency(serverUrisList()).filter(s => s.latency !== null).sort((a, b) => (a.latency ? a.latency : Infinity) - (b.latency ? b.latency : Infinity));
      if (servers.length > 0) {
        server = servers[0].uri;
        chain_name = servers[0].chain_name;  
      } else {
        // none of the servers are working properly.
        server = serverUrisList()[0].uri;
        chain_name = serverUrisList()[0].chain_name;
      }
      selection = 'list';
      await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: server });
      await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
      await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
    }

    console.log('&&&&&&&&---------', server, chain_name, selection);

    this.setState({
      serverUris: servers,
      url: server,
      chain: chain_name,
      selection,
    });
    this.props.setServerUris(servers);
  };

  doFirstTimeSetup = async () => {
    await this.loadServer();

    // Try to load the light client
    const { url, chain, changeAnotherWallet } = this.state;

    console.log(`Url: -${url}-`);

    // First, set up the exit handler
    this.setupExitHandler();

    // if is: `change to another wallet` exit here 
    if (changeAnotherWallet) {
      return;
    }
    
    try {
      // Test to see if the wallet exists 
      if (!native.zingolib_wallet_exists(url, chain)) {
        // Show the wallet creation screen
        this.setState({ walletScreen: 1 });
      } else {
        const result: string = native.zingolib_init_from_b64(url, chain);
        console.log(`Initialization: ${result}`);
        if (result !== "OK") {
          this.setState({
            currentStatus: (
              <span>
                Error Initializing Lightclient
                <br />
                {`${result}`}
              </span>
            ),
            currentStatusIsError: true,
          });

          return;
        }

        this.getInfo();
        // seed or ufvk
        const walletKindStr: string = await native.zingolib_execute_async("wallet_kind", "");
        const walletKindJSON = JSON.parse(walletKindStr);

        if (walletKindJSON.kind === "Seeded") {
          // seed
          this.props.setReadOnly(false);
        } else {
          // ufvk
          this.props.setReadOnly(true);
        }
      }
    } catch (err) {
      console.log("Error initializing", err);
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient
            <br />
            {`${err}`}
          </span>
        ),
        currentStatusIsError: true,
      });
    }
  };

  setupExitHandler = () => {
    // App is quitting, make sure to save the wallet properly.
    ipcRenderer.on("appquitting", () => {
      RPC.deinitialize();

      // And reply that we're all done after 100ms, to allow cleanup of the rust stuff.
      setTimeout(() => {
        ipcRenderer.send("appquitdone");
      }, 100);
    });
  };

  calculateServerLatency = (serverUris: Server[]): Server[] => {
    const servers: Server[] = serverUris.filter((s: Server) => s.obsolete === false);
    servers.forEach((server: Server, index: number) => {
      const start: number = Date.now();
      const  b = native.zingolib_get_latest_block_server(server.uri);
      const end: number = Date.now();
      let latency = null;
      if (!b.toLowerCase().startsWith('error')) {
        latency = end - start;
      }
      console.log('******* server LAST BLOCK', server.uri, index, b, latency, 'ms');
      servers[index].latency = latency;
    });
    return servers;
  };

  getInfo = async () => {
    // Try getting the info.
    try {
      // Do a sync at start
      this.setState({ currentStatus: "Setting things up..." });

      // Grab the previous sync ID.
      const syncStatus: string = await RPC.doSyncStatus();
      const prevSyncId: number = JSON.parse(syncStatus).sync_id;

      // This will do the sync in another thread, so we have to check for sync status
      RPC.doSync();
      console.log('after dosync');

      this.runSyncStatusPoller(prevSyncId);
    } catch (err) {
      console.log("Error initializing", err);
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient 
            <br />
            {`${err}`}
          </span>
        ),
        currentStatusIsError: true,
      });
    }
  }

  runSyncStatusPoller = async (prevSyncId: number) => {
    console.log('start runSyncStatusPoller');

    const { setRPCConfig, setInfo, setRescanning } = this.props;
    const { url, chain } = this.state;

    const info: Info = await RPC.getInfoObject();
    console.log(info);

    if (info.error) {
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient
            <br />
            {`${info.error}`}
          </span>
        ),
        currentStatusIsError: true,
      });
      return;
    }

    // And after a while, check the sync status.
    const myThis = this;
    const poller = setInterval(async () => {
      const syncstatus: string = await RPC.doSyncStatus();

      if (syncstatus.toLowerCase().startsWith("error")) {
        // Something went wrong
        myThis.setState({
          currentStatus: syncstatus,
          currentStatusIsError: true,
        });

        // And cancel the updater
        clearInterval(poller);
      } else {
        const ss = JSON.parse(syncstatus);
        console.log('sync status', ss);
        console.log(`Prev SyncID: ${prevSyncId} - Current SyncID: ${ss.sync_id} - progress: ${ss.in_progress} - Current Batch: ${ss.batch_num}`);

        // if this process synced already 25 batches (2.500 blocks) -> let's go to dashboard 
        if (ss.sync_id > prevSyncId || !ss.in_progress || ss.batch_num >= 25) {
          setInfo(info);

          setRescanning(false, prevSyncId);

          // Configure the RPC, which will setup the refresh
          const rpcConfig = new RPCConfig();
          rpcConfig.url = url;
          rpcConfig.chain = chain;
          setRPCConfig(rpcConfig);

          // And cancel the updater
          clearInterval(poller);

          // This will cause a redirect to the dashboard screen
          myThis.setState({ loadingDone: true });
        } else {
          // Still syncing, grab the status and update the status
          let progress_blocks = (ss.synced_blocks + ss.trial_decryptions_blocks + ss.witnesses_updated) / 3;

          let progress = progress_blocks;
          if (ss.total_blocks) {
            progress = (progress_blocks * 100) / ss.total_blocks;
          }

          let base = 0;
          if (ss.batch_total) {
            base = (ss.batch_num * 100) / ss.batch_total;
            progress = base + progress / ss.batch_total;
          }

          if (!isNaN(progress_blocks)) {
            let batch_progress = (progress_blocks * 100) / ss.total_blocks;
            if (isNaN(batch_progress)) {
              batch_progress = 0;
            }
            const currentStatus = (
              <div>
                Syncing batch {ss.batch_num} of {ss.batch_total}
                <br />
                <br />
                Batch Progress: {batch_progress.toFixed(2)}%. Total progress: {progress.toFixed(2)}%.
                <br />
                <br />
                <br />
                Please wait...
                <br />
                This could take several minutes or hours
              </div>
            );
            myThis.setState({ currentStatus });
          }
        }
      }
    }, 2 * 1000);
  };

  createNewWallet = async () => {
    const { url, chain } = this.state;
    const result: string = native.zingolib_init_new(url, chain);

    if (result.toLowerCase().startsWith("error")) {
      console.log('creating new wallet', result);
      this.setState({ walletScreen: 2, newWalletError: result });
    } else {
      const seed: string = await RPC.fetchSeed();
      this.setState({ walletScreen: 2, seed });
      this.props.setReadOnly(false);
    }
  };

  startNewWallet = () => {
    // Start using the new wallet
    this.setState({ walletScreen: 0 });
    this.getInfo();
  };

  restoreExistingSeedWallet = () => {
    this.setState({ walletScreen: 3 });
  };

  restoreExistingUfvkWallet = () => {
    this.setState({ walletScreen: 4 });
  };

  updateSeed = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ seed: e.target.value });
  };

  updateUfvk = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ ufvk: e.target.value });
  };

  updateBirthday = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ birthday: isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value) }); 
  };

  restoreSeedWalletBack = () => {
    // Reset the seed and birthday and try again 
    this.setState({
      seed: "",
      birthday: 0,
      newWalletError: null,
      walletScreen: 3,
    });
    this.props.setReadOnly(false);
  };

  restoreUfvkWalletBack = () => {
    // Reset the ufvk and birthday and try again 
    this.setState({
      ufvk: "",
      birthday: 0,
      newWalletError: null,
      walletScreen: 4,
    });
    this.props.setReadOnly(false);
  };

  doRestoreSeedWallet = async () => {
    const { seed, birthday, url, chain } = this.state;
    console.log(`Restoring ${seed} with ${birthday}`);

    const result: string = native.zingolib_init_from_seed(url, seed, birthday, chain);
    if (result.toLowerCase().startsWith("error")) {
      this.setState({ newWalletError: result });
    } else {
      this.setState({ walletScreen: 0 });
      this.getInfo();
      this.props.setReadOnly(false);
    }
  };

  doRestoreUfvkWallet = async () => {
    const { ufvk, birthday, url, chain } = this.state;
    console.log(`Restoring ${ufvk} with ${birthday}`);

    const result: string = native.zingolib_init_from_ufvk(url, ufvk, birthday, chain);
    if (result.toLowerCase().startsWith("error")) {
      this.setState({ newWalletError: result });
    } else {
      this.setState({ walletScreen: 0 });
      this.getInfo();
      this.props.setReadOnly(true);
    }
  };

  deleteWallet = async () => { 
    const { url, chain } = this.state;
    if (native.zingolib_wallet_exists(url, chain)) {
      // interrupt syncing, just in case.
      const resultInterrupt: string = await native.zingolib_execute_async("interrupt_sync_after_batch", "true");
      console.log("Interrupting sync ...", resultInterrupt);
      setTimeout(async () => {
        const resultDelete: string = await native.zingolib_execute_async("delete", "");
        console.log("deleting ...", resultDelete);
        native.zingolib_deinitialize();
  
        // restart the App now.
        ipcRenderer.send("apprestart");
      }, 1000);
    }
  };

  render() {
    const { buttonsDisable, loadingDone, currentStatus, currentStatusIsError, walletScreen, newWalletError, seed, ufvk, birthday } =
      this.state;

    const { openServerSelectModal } = this.props;

    console.log('loading screen render', buttonsDisable);

    if (loadingDone) {
        setTimeout(() => this.props.navigateToDashboard(), 500);
    }

    // If still loading, show the status 
    return (
      <div className={[cstyles.verticalflex, cstyles.center, styles.loadingcontainer].join(" ")}>
        <div style={{ marginTop: "70px", marginBottom: "20px" }}>
          <Logo readOnly={false} />
        </div>
        {walletScreen === 0 && (
          <div>
            <div>{currentStatus}</div>
            {currentStatusIsError && (
              <div className={cstyles.buttoncontainer}>
                <button disabled={buttonsDisable} type="button" className={cstyles.primarybutton} onClick={openServerSelectModal}>
                  Switch to Another Server
                </button>
                <button
                  disabled={buttonsDisable}
                  type="button"
                  className={cstyles.primarybutton}
                  onClick={async () => {
                    this.setState({
                      currentStatus: "", 
                      currentStatusIsError: false,
                      newWalletError: null,
                      changeAnotherWallet: false,
                      buttonsDisable: true,
                    });
                    await this.doFirstTimeSetup();
                    this.setState({ buttonsDisable: false })
                  }}
                >
                  Open Current Wallet File
                </button>
                <button
                  disabled={buttonsDisable}
                  type="button"
                  className={cstyles.primarybutton}
                  onClick={async () => {
                    this.setState({
                      currentStatus: "",
                      currentStatusIsError: false,
                      walletScreen: 0,
                      newWalletError: null,
                      changeAnotherWallet: false,
                      buttonsDisable: true,
                    });
                    await this.deleteWallet();
                    this.setState({ buttonsDisable: false })
                  }}
                >
                  Delete Current Wallet File
                </button>
              </div>
            )}
          </div>
        )}

        {walletScreen === 1 && (
          <div>
            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                <div className={[cstyles.large, cstyles.highlight].join(" ")}>Create A New Wallet</div>
                <div className={cstyles.padtopsmall}>
                  Creates a new wallet with a new randomly generated seed phrase. Please save the seed phrase
                  carefully, it&rsquo;s the only way to restore your wallet.
                </div>
                <div className={cstyles.margintoplarge}>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={async () => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        walletScreen: 0,
                        newWalletError: null,
                        buttonsDisable: true,
                      });
                      await this.createNewWallet();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Create New Wallet
                  </button>
                  <button disabled={buttonsDisable} type="button" className={cstyles.primarybutton} onClick={openServerSelectModal}>
                    Switch to Another Server
                  </button>
                </div>
              </div>
              <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
                <div className={[cstyles.large, cstyles.highlight].join(" ")}>Restore Wallet From Seed</div>
                <div className={cstyles.padtopsmall}>
                  If you already have a seed phrase, you can restore it to this wallet. This will rescan the
                  blockchain for all transactions from the seed phrase.
                </div>
                <div className={cstyles.margintoplarge}>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        newWalletError: null,
                        buttonsDisable: true,
                      });
                      this.restoreExistingSeedWallet();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Restore Wallet from Seed
                  </button>
                </div>
              </div>
              <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
                <div className={[cstyles.large, cstyles.highlight].join(" ")}>Restore Wallet From Viewing Key</div>
                <div className={cstyles.padtopsmall}>
                  If you already have a Unified Full Viewing Key, you can restore it to this wallet. This will rescan the
                  blockchain for all transactions from the UFVK.
                </div>
                <div className={cstyles.margintoplarge}>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        newWalletError: null,
                        buttonsDisable: true,
                      });
                      this.restoreExistingUfvkWallet();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Restore Wallet from Viewing Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {walletScreen === 2 && (
          <div>
            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                {newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Error Creating New Wallet</div>
                    <div className={cstyles.padtopsmall}>There was an error creating a new wallet</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{newWalletError}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={() => {
                          this.setState({ walletScreen: 1 });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Your New Wallet</div>
                    <div className={cstyles.padtopsmall}>
                      This is your new wallet. Below is your seed phrase. PLEASE STORE IT CAREFULLY! The seed phrase
                      is the only way to recover your funds and transactions.
                    </div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{seed}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={this.startNewWallet}
                      >
                        Start Wallet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {walletScreen === 3 && (
          <div>
            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                {newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Error Restoring Wallet</div>
                    <div className={cstyles.padtopsmall}>There was an error restoring your seed phrase</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{newWalletError}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={this.restoreSeedWalletBack}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {!newWalletError && (
                  <div>
                    <div className={[cstyles.large].join(" ")}>Please enter your seed phrase</div>
                    <TextareaAutosize
                      className={cstyles.inputbox}
                      value={seed}
                      onChange={(e) => this.updateSeed(e)}
                    />

                    <div className={[cstyles.large, cstyles.margintoplarge].join(" ")}>
                      Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;0&rsquo;
                    </div>
                    <input
                      type="number"
                      className={cstyles.inputbox}
                      value={birthday}
                      onChange={(e) => this.updateBirthday(e)}
                    />

                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={async () => {
                          this.setState({ buttonsDisable: true });
                          await this.doRestoreSeedWallet();
                          this.setState({ buttonsDisable: false });
                        }}
                      >
                        Restore Wallet
                      </button>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={() => {
                          this.setState({ walletScreen: 1 });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {walletScreen === 4 && (
          <div>
            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                {newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Error Restoring Wallet</div>
                    <div className={cstyles.padtopsmall}>There was an error restoring your Viewing Key</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{newWalletError}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={this.restoreUfvkWalletBack}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {!newWalletError && (
                  <div>
                    <div className={[cstyles.large].join(" ")}>Please enter your Unified Full Viewing Key</div>
                    <TextareaAutosize
                      className={cstyles.inputbox}
                      value={ufvk}
                      onChange={(e) => this.updateUfvk(e)}
                    />

                    <div className={[cstyles.large, cstyles.margintoplarge].join(" ")}>
                      Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;0&rsquo;
                    </div>
                    <input
                      type="number"
                      className={cstyles.inputbox}
                      value={birthday}
                      onChange={(e) => this.updateBirthday(e)}
                    />

                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={async () => {
                          this.setState({ buttonsDisable: true });
                          await this.doRestoreUfvkWallet();
                          this.setState({ buttonsDisable: false });
                        }}
                      >
                        Restore Wallet
                      </button>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={() => {
                          this.setState({ walletScreen: 1 });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );

  }
}

// @ts-ignore
export default withRouter(LoadingScreen);
