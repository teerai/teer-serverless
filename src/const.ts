export const getTeerEndpoint = () => {
  return `http://track.teer.ai${process.env.NODE_ENV === 'development' ? ':5171' : ''}/v1/spans/bulk`
}
