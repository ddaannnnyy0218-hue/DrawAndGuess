# Third-party model and drawing data

## Quick, Draw! drawing samples

Google, Inc. and the contributors to the Quick, Draw! Dataset.
Source: https://github.com/googlecreativelab/quickdraw-dataset
License: Creative Commons Attribution 4.0 International.
https://creativecommons.org/licenses/by/4.0/

The files in public/drawings contain 24 recorded human drawings per category, across 345 categories (8,280 drawings total). They are bounded excerpts of recognized simplified strokes.
Personal metadata (country and timestamp) is omitted. Source key identifiers are
retained for attribution and traceability. Coordinates are scaled at runtime and
drawings are replayed progressively with generated pacing and a small affine transformations. Composite scene prompts arrange independently recorded human subjects into original scene layouts. Chinese translations, scene recipes and answer aliases are authored for this game. Recognition confidence metadata is computed locally for sample curation. These are recorded human doodles replayed by
the game; they are not newly generated AI artwork.

## DoodleNet

Pretrained DoodleNet, trained by Yining Shi on the Quick, Draw! Dataset.
Distributed through ml5 Data and Models:
https://github.com/ml5js/ml5-data-and-models/tree/main/models/doodlenet
https://github.com/yining1023/doodleNet

The ml5 model distribution is MIT licensed. The corresponding MIT notice is
retained at public/models/doodlenet/LICENSE.txt.
The serialized model's redundant intermediate batch_input_shape metadata was
removed for compatibility with TensorFlow.js 4; learned weights are unchanged.

TensorFlow.js is used under Apache-2.0. Package license notices remain in its
distribution. TensorFlow.js is retained as a development-time numerical reference. Ranked bot recognition uses the same unchanged weights in a small CPU forward pass in the server Worker.
