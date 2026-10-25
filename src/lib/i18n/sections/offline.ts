/**
 * Strings for working without a connection, reached as d.ux.offline.<key>.
 *
 * Covers the header indicator and badge, the "Waiting to upload" dialog, the
 * saved-on-this-device confirmation, the sign-out warning and the shared
 * "needs a connection" wording. Same rules as the other sections: labels only
 * (never a stored value), {braces} for interpolation through t(), and the
 * Chinese object is typed as the English one so a gap is a compile error.
 *
 * ⚠️ HONEST COPY. Pebble cannot upload in the background: iOS has no
 * Background Sync for web apps, so a waiting transaction goes up only while
 * the app is open. The dialog says so rather than promising otherwise.
 */
export const offlineEn = {
  // Header strip.
  indicator: 'Offline — showing saved data',
  indicatorShort: 'Offline',
  waitingOne: '1 waiting to upload',
  waitingMany: '{count} waiting to upload',
  waitingAria: 'Waiting to upload. Open the list.',
  // The "Waiting to upload" dialog.
  dialogTitle: 'Waiting to upload',
  introOnline: "You're back online. Upload the transactions you saved on this device?",
  introOffline: "You're offline. These are saved on this device and can be uploaded once you're back online.",
  introRunning: 'Uploading one at a time…',
  notCounted: "They don't count toward your balances or charts until they're uploaded.",
  appOpenNote: 'Pebble uploads only while the app is open, so keep it open once you have a signal.',
  uploadNow: 'Upload now',
  uploading: 'Uploading…',
  later: 'Later',
  close: 'Close',
  needsConnectionToUpload: 'Connect to the internet to upload.',
  // One row.
  statusWaiting: 'Waiting',
  statusUploading: 'Uploading',
  statusDone: 'Uploaded',
  statusFailed: 'Not uploaded',
  noDescription: 'No description',
  remove: 'Remove',
  removeAria: 'Remove from the waiting list',
  removeConfirm: 'Remove this transaction? It has not been uploaded and cannot be recovered.',
  removeKeep: 'Keep',
  removeYes: 'Remove',
  retry: 'Retry',
  failedGeneric: "The server didn't accept this one. Remove it and add it again.",
  // Results.
  summaryAll: 'All uploaded',
  summaryAllBody: 'Your transactions are now in your account.',
  summarySome: '{done} uploaded, {failed} still waiting',
  summarySomeBody: 'Fix or remove what failed, or try again.',
  sessionExpired: 'Your sign-in has expired. Sign in again to upload — your waiting transactions are kept on this device.',
  signInAgain: 'Sign in',
  connectionLost: 'The connection dropped. Nothing was lost — the rest are still waiting.',
  emptyTitle: 'Nothing is waiting',
  emptyBody: 'Everything you saved offline has been uploaded.',
  // Saved-on-this-device confirmation (Add transaction).
  savedOnDevice: 'Saved on this device',
  savedOnDeviceBody: "You'll be asked to upload it once you're back online.",
  modalNote: "You're offline. This will be saved on this device and uploaded later.",
  storageUnavailable: "Couldn't save this on the device — its storage may be full or blocked (private browsing). Nothing was saved.",
  // Any other change made without a connection.
  needsConnection: "You're offline. This needs a connection, so nothing was changed.",
  // Sign-out with transactions still waiting.
  signOutTitle: 'Transactions are still waiting',
  signOutBody: '{count} saved on this device haven’t been uploaded yet. If you sign out they stay here, and upload the next time you sign in with this account.',
  signOutCancel: 'Stay signed in',
  signOutKeep: 'Keep them and sign out',
  signOutDiscard: 'Discard them and sign out',
};

export const offlineZh: typeof offlineEn = {
  indicator: '离线中，正在显示已保存的数据',
  indicatorShort: '离线',
  waitingOne: '1 笔待上传',
  waitingMany: '{count} 笔待上传',
  waitingAria: '有待上传的交易，点按查看清单。',
  dialogTitle: '待上传',
  introOnline: '网络已恢复。要上传在这台设备上保存的交易吗？',
  introOffline: '当前离线。这些交易已保存在这台设备上，联网后即可上传。',
  introRunning: '正在逐笔上传…',
  notCounted: '上传之前，它们不会计入余额和图表。',
  appOpenNote: 'Pebble 只能在应用打开时上传，所以有信号后请保持应用开着。',
  uploadNow: '立即上传',
  uploading: '正在上传…',
  later: '稍后',
  close: '关闭',
  needsConnectionToUpload: '联网后才能上传。',
  statusWaiting: '等待中',
  statusUploading: '上传中',
  statusDone: '已上传',
  statusFailed: '未上传',
  noDescription: '无备注',
  remove: '移除',
  removeAria: '从待上传清单中移除',
  removeConfirm: '要移除这笔交易吗？它还没有上传，移除后无法找回。',
  removeKeep: '保留',
  removeYes: '移除',
  retry: '重试',
  failedGeneric: '服务器没有接受这一笔。请移除后重新添加。',
  summaryAll: '全部上传完成',
  summaryAllBody: '这些交易已经记入你的账户。',
  summarySome: '已上传 {done} 笔，还有 {failed} 笔未完成',
  summarySomeBody: '请修改或移除未成功的交易，也可以再试一次。',
  sessionExpired: '登录已过期。请重新登录后再上传，待上传的交易会继续保存在这台设备上。',
  signInAgain: '登录',
  connectionLost: '网络中断了。没有丢失任何内容，其余交易仍在等待上传。',
  emptyTitle: '没有待上传的交易',
  emptyBody: '离线时保存的交易都已上传。',
  savedOnDevice: '已保存在这台设备上',
  savedOnDeviceBody: '联网后会自动提示你上传。',
  modalNote: '当前离线。这笔交易会先保存在这台设备上，之后再上传。',
  storageUnavailable: '无法保存到这台设备，可能是存储空间已满，或浏览器禁用了存储（如无痕模式）。这笔交易没有保存。',
  needsConnection: '当前离线，这项操作需要联网，所以没有做任何更改。',
  signOutTitle: '还有交易没有上传',
  signOutBody: '这台设备上还有 {count} 笔交易没有上传。退出登录后它们会留在这里，下次用这个账号登录时再上传。',
  signOutCancel: '保持登录',
  signOutKeep: '保留交易并退出',
  signOutDiscard: '丢弃交易并退出',
};
