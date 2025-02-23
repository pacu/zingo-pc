import React, { useContext, useEffect, useState } from "react";
import styles from "./Send.module.css";
import cstyles from "../common/Common.module.css";
import {
  ToAddr,
  SendPageState,
  AddressBookEntry,
  SendProgress,
  Address,
  AddressType,
} from "../appstate";
import Utils from "../../utils/utils";
import ScrollPane from "../scrollPane/ScrollPane";
import { BalanceBlockHighlight } from "../balanceblock";
import { parseZcashURI, ZcashURITarget } from "../../utils/uris";
import SendManyJsonType from "./components/SendManyJSONType";
import ToAddrBox from "./components/ToAddrBox";
import ConfirmModal from "./components/ConfirmModal";
import { ContextApp } from "../../context/ContextAppState";

import native from "../../native.node";
import getSendManyJSON from "./components/getSendManyJSON";

type SendProps = {
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
  sendTransaction: (sendJson: SendManyJsonType[], setSendProgress: (p?: SendProgress) => void) => Promise<string>;
  setSendPageState: (sendPageState: SendPageState) => void;
  openErrorModal: (title: string, body: string | JSX.Element) => void;
  openPasswordAndUnlockIfNeeded: (successCallback: () => void) => void;
  calculateShieldFee: () => Promise<number>;
  handleShieldButton: () => void;
};

const Send: React.FC<SendProps> = ({
  setSendTo,
  sendTransaction,
  setSendPageState,
  openErrorModal,
  openPasswordAndUnlockIfNeeded,
  calculateShieldFee,
  handleShieldButton,
}) => {
  const context = useContext(ContextApp);
  const {
    addresses,
    sendPageState,
    info,
    totalBalance,
    readOnly,
    addressBook,
    fetchError,
  } = context;

  const [modalIsOpen, setModalIsOpen] = useState<boolean>(false);
  const [sendButtonEnabled, setSendButtonEnabled] = useState<boolean>(false);
  const [sendFee, setSendFee] = useState<number>(0);
  const [sendFeeError, setSendFeeError] = useState<string>('');
  const [totalAmountAvailable, setTotalAmountAvailable] = useState<number>(0);
  const [tooltip, setTooltip ] = useState<string>('');
  const [fromaddr, setFromaddr] = useState<string>('');

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  useEffect(() => {
    const _anyPending: Address | undefined = !!addresses && addresses.find((i: Address) => i.containsPending === true);
    setAnyPending(!!_anyPending);
  }, [addresses]);
    
  useEffect(() => {
    if (totalBalance.transparent > 0) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalBalance.transparent, anyPending]); 

  useEffect(() => {
    // transparent funds are not spendable.
    let _totalAmountAvailable: number = totalBalance.spendableZ + totalBalance.spendableO;
    _totalAmountAvailable = Number(Utils.maxPrecisionTrimmed(_totalAmountAvailable));
    if (_totalAmountAvailable < 0) {
      _totalAmountAvailable = 0;
    }
    setTotalAmountAvailable(_totalAmountAvailable);
    setFromaddr(addresses.find((a: Address) => a.type === AddressType.unified)?.address || ""); 

    // If there are unverified funds, then show a tooltip
    let _tooltip: string = "";
    if (totalBalance.unverifiedZ + totalBalance.unverifiedO > 0) {
      _tooltip = `Waiting for confirmation of ZEC ${totalBalance.unverifiedZ + totalBalance.unverifiedO} with 1 block (approx 2 minutes)`; 
    }
    setTooltip(_tooltip);
  }, [addresses, totalBalance.spendableO, totalBalance.spendableZ, totalBalance.unverifiedO, totalBalance.unverifiedZ]);  

  const clearToAddrs = () => {
    const newToAddrs: ToAddr[] = [new ToAddr(Utils.getNextToAddrID())];

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    newState.toaddrs = newToAddrs;

    setSendPageState(newState);
    setSendFee(0);
    setSendFeeError('');

    // transparent funds are not spendable.
    let _totalAmountAvailable: number = totalBalance.spendableZ + totalBalance.spendableO;
    _totalAmountAvailable = Number(Utils.maxPrecisionTrimmed(_totalAmountAvailable));
    if (_totalAmountAvailable < 0) {
      _totalAmountAvailable = 0;
    }
    setTotalAmountAvailable(_totalAmountAvailable);
  };

  const updateToField = async (
    id: number,
    address: string | null,
    amount: string | null,
    memo: string | null,
    memoReplyTo: string | null
  ) => {
    // Find the correct toAddr
    const toAddr: ToAddr | undefined = sendPageState.toaddrs.find((a: ToAddr) => a.id === id);
    const restToAddr: ToAddr[] = sendPageState.toaddrs.filter((a: ToAddr) => a.id !== id);
    if (address !== null) {
      // First, check if this is a URI
      const parsedUri: string | ZcashURITarget[] = await parseZcashURI(address.replace(/ /g, ""));
      if (typeof parsedUri === "string") {
        if (parsedUri.toLowerCase().startsWith('error')) {
          // with error leave the same value
          if (toAddr) {
            toAddr.to = address.replace(/ /g, ""); // Remove spaces 
          }
        } else {
          // if it is string with no error, it is an address
          if (toAddr) {
            toAddr.to = parsedUri
          }
        }
      } else {
        // if no string and no error extract all the infro from the URI
        setSendTo(parsedUri);
        return;
      }
    }

    if (amount !== null) {
      // Check to see the new amount if valid
      const newAmount: number = parseFloat(amount);
      if (newAmount < 0 || newAmount > 21 * 10 ** 6) {
        return;
      }
      if (toAddr) {
        toAddr.amount = newAmount;
      }
    }

    if (memo !== null && toAddr) {
      toAddr.memo = memo;
    }

    if (memoReplyTo != null && toAddr) {
      toAddr.memoReplyTo = memoReplyTo;
    }

    // Create the new state object 
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    if (restToAddr && restToAddr.length > 0) {
      if (toAddr) {
        newState.toaddrs = [toAddr, ...restToAddr];
      }
    } else {
      if (toAddr) {
        newState.toaddrs = [toAddr];
      }
    }

    setSendPageState(newState);
  };

  const setMaxAmount = async (id: number, total: number) => {
    // Find the correct toAddr
    const toAddr: ToAddr | undefined = sendPageState.toaddrs.find((a: ToAddr) => a.id === id);
    const restToAddr: ToAddr[] = sendPageState.toaddrs.filter((a: ToAddr) => a.id !== id);

    let totalOtherAmount: number = 0;
    
    if (restToAddr && restToAddr.length > 0) {
      totalOtherAmount = restToAddr.reduce((s: number, a: ToAddr) => s + a.amount, 0);
    }

    if (toAddr) {
      toAddr.amount = total - totalOtherAmount;
      if (toAddr.amount < 0) toAddr.amount = 0;
      toAddr.amount = Number(Utils.maxPrecisionTrimmed(toAddr.amount)); 
    }
    
    // Create the new state object 
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    if (restToAddr && restToAddr.length > 0) {
      if (toAddr) {
        newState.toaddrs = [toAddr, ...restToAddr];
      }
    } else {
      if (toAddr) {
        newState.toaddrs = [toAddr];
      }
    }

    setSendPageState(newState);
  };

  const openModal = () => {
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setModalIsOpen(false);
  };

  const getLabelAddressBook = (addr: string) => {
    // Find the addr in addresses
    const label: AddressBookEntry | undefined = addressBook.find((ab: AddressBookEntry) => ab.address === addr);
    const labelStr: string = label ? ` [ ${label.label} ]` : "";

    return labelStr; 
  };

  const calculateSendFee = async (): Promise<{fee: number, error: string, spendable: number}> => {
    let _fee: number = 0;
    let _error: string = '';
    // transparent funds are not spendable.
    let _spendable: number = totalBalance.spendableZ + totalBalance.spendableO;
    if (sendPageState.toaddrs[0].to) {
      const spendableBalanceJSON = { address: sendPageState.toaddrs[0].to, zennies_for_zingo: false };
      const result: string = await native.zingolib_execute_async("spendablebalance", JSON.stringify(spendableBalanceJSON));
      console.log('SPENDABLEBALANCE', result);
      const resultJSON = JSON.parse(result);
      if (resultJSON.error) {
        _error = resultJSON.error;
        _spendable = 0;
      } else if (resultJSON.balance) {
        _spendable = resultJSON.balance / 10 ** 8;
      }
    }
    if (sendPageState.toaddrs[0].amount >= 0 && sendPageState.toaddrs[0].to && !_error) {
      const sendJson: SendManyJsonType[] = getSendManyJSON(sendPageState);
      console.log(sendJson);
      const result: string = await native.zingolib_execute_async("send", JSON.stringify(sendJson));
      console.log('SEND', result);
      const resultJSON = JSON.parse(result);
      if (resultJSON.error) {
        _error = resultJSON.error;
      } else if (resultJSON.fee) {
        _fee = resultJSON.fee / 10 ** 8;
      }
    }
    _spendable = Number(Utils.maxPrecisionTrimmed(_spendable));
    if (_spendable < 0) {
      _spendable = 0;
    }
    return {fee: _fee, error: _error, spendable: _spendable};
  };

  const fetchSendFeeAndErrorAndSpendable = async (): Promise<void> => {
    const { fee, error, spendable} = await calculateSendFee();
    console.log(fee, spendable, error);
    setSendFee(fee);
    setSendFeeError(error);
    setTotalAmountAvailable(spendable);
  };

  if (readOnly) {
    return <div className={cstyles.well} style={{ textAlign: "center" }}>This is a only-watch wallet, it is imposible to spend/send the balance.</div>;
  }

  return (
    <div>
      <ConfirmModal
          sendPageState={sendPageState}
          totalBalance={totalBalance}
          info={info}
          sendTransaction={sendTransaction}
          openErrorModal={openErrorModal}
          closeModal={closeModal}
          modalIsOpen={modalIsOpen}
          clearToAddrs={clearToAddrs}
          openPasswordAndUnlockIfNeeded={openPasswordAndUnlockIfNeeded}
          sendFee={sendFee}
          currencyName={info.currencyName}
      />

      <div className={[cstyles.well, styles.containermargin].join(" ")}>
        <div className={[cstyles.balancebox].join(" ")}>
          <BalanceBlockHighlight
            topLabel="All Funds"
            zecValue={totalBalance.total}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.total)}
            currencyName={info.currencyName}
          />
          <BalanceBlockHighlight
            topLabel="Spendable Funds"
            zecValue={totalAmountAvailable}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalAmountAvailable)}
            currencyName={info.currencyName}
            tooltip={tooltip}
          />
        </div>
        <div className={cstyles.balancebox}>
          {totalBalance.transparent >= shieldFee && shieldFee > 0 && !readOnly && !anyPending &&  (
            <>
              <button className={[cstyles.primarybutton].join(" ")} type="button" onClick={handleShieldButton}>
                Shield Transparent Balance To Orchard (Fee: {shieldFee})
              </button>
            </>
          )}
          {!!anyPending && (
            <div className={[cstyles.red, cstyles.small, cstyles.padtopsmall].join(" ")}>
              Some transactions are pending. Balances may change.
            </div>
          )}
        </div>
        {!!fetchError && !!fetchError.error && (
          <>
            <hr />
            <div className={cstyles.balancebox} style={{ color: 'red' }}>
              {fetchError.command + ': ' + fetchError.error}
            </div>
          </>
        )}
      </div>

      <div className={[cstyles.xlarge, cstyles.marginnegativetitle, cstyles.center].join(" ")}>Send</div> 

      <div className={[styles.horizontalcontainer].join(" ")}>
        <div className={cstyles.containermarginleft}>
          <ScrollPane offsetHeight={260}>
            {[sendPageState.toaddrs[0]].map((toaddr: ToAddr) => {
              return (
                <ToAddrBox
                  key={toaddr.id}
                  toaddr={toaddr}
                  zecPrice={info.zecPrice}
                  updateToField={updateToField}
                  fromAddress={fromaddr}
                  fromAmount={totalAmountAvailable}
                  fromAmountDefault={totalBalance.spendableZ + totalBalance.spendableO}
                  setMaxAmount={setMaxAmount}
                  setSendButtonEnabled={setSendButtonEnabled}
                  sendFee={sendFee}
                  sendFeeError={sendFeeError}
                  fetchSendFeeAndErrorAndSpendable={fetchSendFeeAndErrorAndSpendable}
                  setSendFee={setSendFee}
                  setSendFeeError={setSendFeeError}
                  setTotalAmountAvailable={setTotalAmountAvailable}
                  label={getLabelAddressBook(toaddr.to)}
                />
              );
            })}
          </ScrollPane>
        </div>

        <div className={cstyles.verticalbuttons}>
          <button
            type="button"
            disabled={!sendButtonEnabled}
            className={cstyles.primarybutton}
            onClick={openModal}
          >
            Send
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={clearToAddrs}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default Send;
