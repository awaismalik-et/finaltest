const modifyVpnConnectionRoute = async (ec2, endpoints, ips, addRoutes) => {
    for (const endpoint of endpoints){
        for (const ip of ips){
            let params = {
                DestinationCidrBlock: `${ip}`, 
                VpnConnectionId: endpoint 
            };
            await (addRoutes ? ec2.createVpnConnectionRoute(params) : ec2.deleteVpnConnectionRoute(params)).promise()
        }
    }
}

module.exports = {modifyVpnConnectionRoute}
