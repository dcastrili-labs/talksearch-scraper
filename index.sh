#! /bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: ./index.sh <YouTubeURL:String> <extractSpeaker:Bool> <regex:String(optional)> <nbSubStr:Number(optional)>"
    echo "\textractSpeaker: true or false depending if you want to extract the speaker name from videos' title"
    echo "\t\tBy default, it takes the second part after the '-'"
    echo "\tregex: allow you to pass a regex to match the speaker name in videos"
    echo "\tnbSubStr: index of the matched substring that is the speaker name"
    exit 1
fi

curl -H "Content-Type: application/json" \
     -X POST \
     -d "{\"youtubeURL\":\"$1\", \"speaker\": { \"extract\": $2, \"regex\": \"$3\", \"nbSubStr\": \"$4\" } }" \
     http://algolia-talksearch.herokuapp.com/index