import { getSubtitles } from 'youtube-captions-scraper';
import algoliasearch from 'algoliasearch';

const APP_ID = process.env.APP_ID;
const API_KEY = process.env.API_KEY;
const client = algoliasearch(APP_ID, API_KEY);
const globalIndex = client.initIndex('ALL_VIDEOS');
const reportIndex = client.initIndex('REPORTS');

function setSettings(newIndex) {
  const replicaIndexName = `${newIndex.indexName}-detail`;
  newIndex.setSettings(
    {
      searchableAttributes: [
        'unordered(title)',
        'unordered(description)',
        'unordered(speaker)',
        'unordered(text)',
      ],
      attributesForFaceting: ['videoId', 'speaker'],
      attributeForDistinct: 'videoId',
      customRanking: ['asc(start)', 'desc(videoRanking)'],
      replicas: [replicaIndexName],
    },
    err => {
      if (err) {
        console.err(err);
        return;
      }
      const replicaIndex = client.initIndex(replicaIndexName);
      replicaIndex.setSettings({
        searchableAttributes: ['unordered(text)'],
        attributesForFaceting: ['videoId'],
        attributeForDistinct: 'videoId',
        customRanking: ['asc(start)'],
      });
    }
  );
}

function addVideoToGlobalIndex(indexName, video) {
  globalIndex.search({ query: video.title }, (err, content) => {
    if (err) {
      console.err(err);
      return;
    }
    if (content.hits.length === 0 || content.hits[0].id !== video.id) {
      globalIndex.addObject({
        ...video,
        indexName,
      });
    }
  });
}

function index(indexName, video, captions) {
  const algoliaIndex = client.initIndex(indexName);
  const captionsWithObjectID = captions.map(caption => ({
    ...caption,
    start: parseFloat(caption.start),
    videoId: video.id,
    title: video.title,
    description: video.description,
    videoThumbnails: video.thumbnails,
    videoRanking: video.ranking,
    channel: video.channel,
    speaker: video.speaker,
    objectID: `${video.id}-${caption.start}`,
  }));

  setSettings(algoliaIndex);

  algoliaIndex.addObjects(captionsWithObjectID);

  addVideoToGlobalIndex(indexName, video);
}

async function checkDuplicateIndex(indexName) {
  // If channel/playlist/video index already exists, copy the existing index
  const content = await reportIndex.search(indexName);
  if (content.hits.length > 0 && content.hits[0].indexName === indexName) {
    return {
      finalIndexName: `${indexName}-${Date.now()}`,
      existingReport: content.hits[0],
    };
  }
  return { finalIndexName: indexName, existingReport: null };
}

export default async function indexToAlgolia(videos, indexName) {
  const { finalIndexName, existingReport } = await checkDuplicateIndex(
    indexName
  );

  if (existingReport) {
    client.copyIndex(indexName, finalIndexName, (err, content) => {
      if (err) {
        console.error(err);
      }
    });
    delete existingReport._highlightResult;
    delete existingReport.objectID;
    existingReport.indexName = finalIndexName;
    return existingReport;
  } else {
    const report = {
      indexName,
      totalVideos: videos.length,
      failures: [],
    };

    for (const video of videos) {
      try {
        const captions = await getSubtitles({
          videoID: video.id,
        });
        index(indexName, video, captions);
      } catch (err) {
        report.failures.push(video.id);
      }
    }

    report.indexedVideos = report.totalVideos - report.failures.length;
    if (report.indexedVideos > 0) {
      reportIndex.addObject(report);
    }
    return report;
  }
}
