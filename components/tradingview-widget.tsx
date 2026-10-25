"use client"

import { memo, useEffect, useRef } from "react"

function TradingViewWidget() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(
    () => {
      if (!container.current || container.current.querySelector("script")) return
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "lineWidth": 2,
          "lineType": 0,
          "chartType": "area",
          "fontColor": "#60756A",
          "gridLineColor": "rgba(221, 235, 226, 0.6)",
          "volumeUpColor": "rgba(34, 171, 148, 0.5)",
          "volumeDownColor": "rgba(247, 82, 95, 0.5)",
          "backgroundColor": "#FFFFFF",
          "widgetFontColor": "#18352A",
          "lineColor": "#3FA66B",
          "topColor": "rgba(63, 166, 107, 0.25)",
          "bottomColor": "rgba(63, 166, 107, 0)",
          "upColor": "#22ab94",
          "downColor": "#f7525f",
          "borderUpColor": "#22ab94",
          "borderDownColor": "#f7525f",
          "wickUpColor": "#22ab94",
          "wickDownColor": "#f7525f",
          "colorTheme": "light",
          "isTransparent": true,
          "locale": "en",
          "chartOnly": false,
          "scalePosition": "right",
          "scaleMode": "Normal",
          "fontFamily": "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
          "valuesTracking": "1",
          "changeMode": "price-and-percent",
          "symbols": [
            [
              "US stocks (S&P 500)",
              "AMEX:SPY|1D"
            ],
            [
              "World stocks",
              "AMEX:VT|1D"
            ],
            [
              "US bonds",
              "NASDAQ:BND|1D"
            ]
          ],
          "dateRanges": [
            "1d|1",
            "1m|30",
            "3m|60",
            "12m|1D",
            "60m|1W",
            "all|1M"
          ],
          "fontSize": "10",
          "headerFontSize": "medium",
          "autosize": true,
          "width": "100%",
          "height": "100%",
          "noTimeScale": false,
          "hideDateRanges": false,
          "hideMarketStatus": false,
          "hideSymbolLogo": false
        }`;
      container.current.appendChild(script)
    },
    []
  );

  return (
    <div className="tradingview-widget-container h-[400px] w-full" ref={container}>
      <div className="tradingview-widget-container__widget h-full"></div>
      <div className="tradingview-widget-copyright"><a href="https://www.tradingview.com/symbols/AMEX-SPY/" rel="noopener nofollow" target="_blank"><span className="blue-text">SPY</span></a><span className="comma">,</span>&nbsp;<a href="https://www.tradingview.com/symbols/AMEX-VT/" rel="noopener nofollow" target="_blank"><span className="blue-text">VT</span></a><span className="and">&nbsp;and&nbsp;</span><a href="https://www.tradingview.com/symbols/NASDAQ-BND/" rel="noopener nofollow" target="_blank"><span className="blue-text">BND</span></a><span className="trademark">&nbsp;by TradingView</span></div>
    </div>
  );
}

export default memo(TradingViewWidget);
