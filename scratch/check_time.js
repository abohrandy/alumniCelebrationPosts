const { format } = require('date-fns');

function checkTime() {
    process.env.TZ = 'Africa/Lagos';
    const now = new Date();
    console.log('Current Date/Time (System):', now.toString());
    console.log('Current Date/Time (UTC):', now.toUTCString());
    console.log('Current Date/Time (Lagos via date-fns):', format(now, 'yyyy-MM-dd HH:mm:ss'));
    console.log('Day of week (0=Sun, 1=Mon, 2=Tue):', now.getDay());
}

checkTime();
