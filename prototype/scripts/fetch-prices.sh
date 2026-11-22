#!/usr/bin/env bash
# Downloads the latest closing prices into the folder given as $1: NSE and BSE cash-market bhavcopies and the AMFI
# NAV file. Walks back up to a week to skip weekends and market holidays. Never fails the build: a missing source just
# leaves its file out, and build-prices.ts keeps the previous prices.
set -u
out="$1"
mkdir -p "$out"
ua="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
day() { TZ=Asia/Kolkata date -d "-$1 day" +%Y%m%d 2>/dev/null || TZ=Asia/Kolkata date -v-"$1"d +%Y%m%d; }

for i in 0 1 2 3 4 5 6; do
  d=$(day "$i")
  if curl -sfL -m 60 -A "$ua" -o "$out/nse.zip" "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${d}_F_0000.csv.zip" \
    && unzip -o -q "$out/nse.zip" -d "$out/nse" 2>/dev/null; then
    echo "NSE bhavcopy $d"
    break
  fi
  rm -rf "$out/nse" "$out/nse.zip"
done

for i in 0 1 2 3 4 5 6; do
  d=$(day "$i")
  if curl -sfL -m 60 -A "$ua" -o "$out/bse.csv" "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${d}_F_0000.CSV" \
    && head -c 6 "$out/bse.csv" | grep -q "TradDt"; then
    echo "BSE bhavcopy $d"
    break
  fi
  rm -f "$out/bse.csv"
done

# Former company names, for statements that name a share instead of giving its ISIN.
curl -sfL -m 60 -A "$ua" -o "$out/namechange.csv" "https://nsearchives.nseindia.com/content/equities/namechange.csv" \
  && head -c 6 "$out/namechange.csv" | grep -q "SYMBOL" && echo "NSE name changes" || rm -f "$out/namechange.csv"

curl -sfL -m 120 -A "$ua" -o "$out/nav.txt" "https://www.amfiindia.com/spages/NAVAll.txt" && echo "AMFI NAVs" || rm -f "$out/nav.txt"
exit 0
