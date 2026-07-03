export const defaultParams = {
  yaw: 0,
  pitch: 0,
  faceWidth: 170,
  faceHeight: 170,
  lowerFaceWidth: 145,
  lowerFaceHeight: 126,
  lowerFaceY: 105,
  lowerFaceSideShift: 38,
  showGuides: true,
  eyeSpacing: 46,
  eyeY: -35,
  eyeSize: 18,
  eyeTilt: 0,
  noseLength: 48,
  mouthWidth: 70,
  smile: 0
};

export const sliderConfig = {
  yaw: [-1, 1, 0.01],
  pitch: [-0.5, 0.5, 0.01],
  faceWidth: [120, 220, 1],
  faceHeight: [120, 220, 1],
  lowerFaceWidth: [80, 190, 1],
  lowerFaceHeight: [60, 150, 1],
  lowerFaceY: [55, 145, 1],
  lowerFaceSideShift: [0, 100, 1],
  eyeSpacing: [25, 70, 1],
  eyeY: [-75, 20, 1],
  eyeSize: [8, 30, 1],
  eyeTilt: [-0.6, 0.6, 0.01],
  noseLength: [20, 80, 1],
  mouthWidth: [30, 110, 1],
  smile: [-35, 35, 1]
};

export const toggleConfig = {
  showGuides: true
};
