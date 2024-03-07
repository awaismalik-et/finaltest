const modifyVpnConnectionRoute = async (ec2, endpoints, ips, addRoutes) => {
    const action = addRoutes ? 'added' : 'removed';
    for (const endpoint of endpoints) {
        for (const ip of ips) {
            let params = {
                DestinationCidrBlock: `${ip}`, 
                VpnConnectionId: endpoint 
            };
            await (addRoutes ? ec2.createVpnConnectionRoute(params) : ec2.deleteVpnConnectionRoute(params)).promise()
            console.log(`${action} '${ip}' in ${endpoint}`);
        }
    }
}

module.exports = {modifyVpnConnectionRoute}
