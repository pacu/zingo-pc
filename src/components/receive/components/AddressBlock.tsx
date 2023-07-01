import React, { useState, useEffect } from "react";
import {
  AccordionItem,
  AccordionItemHeading,
  AccordionItemButton,
  AccordionItemPanel,
} from "react-accessible-accordion";
import QRCode from "qrcode.react";
import styles from "../Receive.module.css";
import cstyles from "../../common/Common.module.css";
import Utils from "../../../utils/utils";
import { Address, AddressType } from "../../appstate";

const { shell, clipboard } = window.require("electron");

type AddressBlockProps = {
  address: Address;
  currencyName: string;
  zecPrice: number;
  privateKey?: string;
  viewKey?: string;
  label?: string;
  fetchAndSetSinglePrivKey: (k: string) => void;
  fetchAndSetSingleViewKey: (k: string) => void;
  shieldTransparentBalanceToOrchard: () => void;
  shieldSaplingBalanceToOrchard: () => void;
};

const AddressBlock = ({
  address,
  label,
  currencyName,
  zecPrice,
  privateKey,
  fetchAndSetSinglePrivKey,
  viewKey,
  fetchAndSetSingleViewKey,
  shieldTransparentBalanceToOrchard,
  shieldSaplingBalanceToOrchard
}: AddressBlockProps) => {
  const { receivers, type } = address;
  const address_address = address.address;
  const balance = address.balance || 0;

  const [copied, setCopied] = useState(false);
  const [timerID, setTimerID] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerID) {
        clearTimeout(timerID);
      }
    };
  });

  const openAddress = () => { 
    if (currencyName === "TAZ") {
      shell.openExternal(`https://chain.so/address/ZECTEST/${address_address}`);
    } else {
      shell.openExternal(`https://zecblockexplorer.com/address/${address_address}`);
    }
  };

  return (
    <AccordionItem key={copied ? 1 : 0} className={[cstyles.well, styles.receiveblock].join(" ")} uuid={address_address}>
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          <div className={[cstyles.verticalflex].join(" ")}>
            {address_address.length < 80 ? address_address : Utils.splitStringIntoChunks(address_address, 3).map(item => <div key={item}>{item}</div>)}
          </div>
        </AccordionItemButton>
      </AccordionItemHeading>
      <AccordionItemPanel className={[styles.receiveDetail].join(" ")}>
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div className={[cstyles.verticalflex, cstyles.marginleft].join(" ")}>
            {label && (
              <div className={cstyles.margintoplarge}>
                <div className={[cstyles.sublight].join(" ")}>Label</div>
                <div className={[cstyles.padtopsmall, cstyles.fixedfont].join(" ")}>{label}</div>
              </div>
            )}

            {type === AddressType.unified && !!receivers && (
              <div className={cstyles.margintopsmall}>
                <div className={[cstyles.sublight].join(" ")}>Address types: {Utils.getReceivers(receivers).join(" + ")}</div>
              </div>
            )}

            {type === AddressType.sapling && (
              <div className={cstyles.margintopsmall}>
                <div className={[cstyles.sublight].join(" ")}>Address type: Sapling</div>
              </div>
            )}

            {type === AddressType.transparent && (
              <div className={cstyles.margintopsmall}>
                <div className={[cstyles.sublight].join(" ")}>Address type: Transparent</div>
              </div>
            )}

            <div className={[cstyles.sublight, cstyles.margintoplarge].join(" ")}>Funds</div>
            <div className={[cstyles.padtopsmall].join(" ")}>
              {currencyName} {balance}
            </div>
            <div className={[cstyles.padtopsmall].join(" ")}>{Utils.getZecToUsdString(zecPrice, balance)}</div>

            <div className={[cstyles.margintoplarge, cstyles.breakword].join(" ")}>
              {privateKey && (
                <div>
                  <div className={[cstyles.sublight].join(" ")}>Private Key</div>
                  <div
                    className={[cstyles.breakword, cstyles.padtopsmall, cstyles.fixedfont, cstyles.flex].join(" ")}
                    style={{ maxWidth: "600px" }}
                  >
                    {/*
                    // @ts-ignore */}
                    <QRCode value={privateKey} className={[styles.receiveQrcode].join(" ")} />
                    <div>{privateKey}</div>
                  </div>
                </div>
              )}
            </div>

            <div className={[cstyles.margintoplarge, cstyles.breakword].join(" ")}>
              {viewKey && (
                <div>
                  <div className={[cstyles.sublight].join(" ")}>Viewing Key</div>
                  <div
                    className={[cstyles.breakword, cstyles.padtopsmall, cstyles.fixedfont, cstyles.flex].join(" ")}
                    style={{ maxWidth: "600px" }}
                  >
                    {/*
                    // @ts-ignore */}
                    <QRCode value={viewKey} className={[styles.receiveQrcode].join(" ")} />
                    <div>{viewKey}</div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
                type="button"
                onClick={() => {
                  clipboard.writeText(address_address);
                  setCopied(true);
                  setTimerID(setTimeout(() => setCopied(false), 5000));
                }}
              >
                {copied ? <span>Copied!</span> : <span>Copy Address</span>}
              </button>
              {/* {type === addressType.sapling && !privateKey && (
                <button
                  className={[cstyles.primarybutton].join(" ")}
                  type="button"
                  onClick={() => fetchAndSetSinglePrivKey(address)}
                >
                  Export Private Key
                </button>
              )}

              {type === addressType.sapling && !viewKey && (
                <button
                  className={[cstyles.primarybutton].join(" ")}
                  type="button"
                  onClick={() => fetchAndSetSingleViewKey(address)}
                >
                  Export Viewing Key
                </button>
              )} */}

              {type === AddressType.transparent && (
                <button className={[cstyles.primarybutton].join(" ")} type="button" onClick={() => openAddress()}>
                  View on explorer <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                </button>
              )}
              {type === AddressType.transparent && (
                <button className={[cstyles.primarybutton].join(" ")} type="button" onClick={shieldTransparentBalanceToOrchard}>
                  Shield Balance To Orchard
                </button>
              )}
              {type === AddressType.sapling && (
                <button className={[cstyles.primarybutton].join(" ")} type="button" onClick={shieldSaplingBalanceToOrchard}>
                  Shield Balance To Orchard
                </button>
              )}
            </div>
          </div>
          <div>
            {/*
                    // @ts-ignore */}
            <QRCode value={address_address} className={[styles.receiveQrcode].join(" ")} />
          </div>
        </div>
      </AccordionItemPanel>
    </AccordionItem>
  );
};

export default AddressBlock;
