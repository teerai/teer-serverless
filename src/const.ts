export const getTeerEndpoint = () => {
  return process.env.NODE_ENV === 'development' ? 'http://track.teer.ai:5171/v1/spans/bulk' : 'https://track.teer.ai/v1/spans/bulk'
}

export const CODE = {
  SUCCESS: 0,
  ERROR: 1,
}
